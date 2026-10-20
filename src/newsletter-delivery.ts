import type { EnvBindings } from './app';
import { SourceHttpError, sourceRequest } from './ingestion-network';
import { newsletterSite, newsletterState, setNewsletterState, requestConfirmation, enqueueEdition } from './newsletter-store';
import { workEmailError } from './work-email';
import type { MailPayload } from './newsletter-content';

type OutboxItem = { id: string; subscriber_id: number; kind: string; payload_json: string; status: string;
  attempts: number; first_attempt_at: string | null; email: string; subscriber_status: string;
  confirmation_hash: string | null; confirmation_expires_at: string | null };
const RETRY_WINDOW_MS = 23 * 3600000;

async function acquireNewsletter(db: D1Database, owner: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db.prepare(`INSERT INTO newsletter_state(key,value,updated_at) VALUES ('lease',?1,?2)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    WHERE newsletter_state.updated_at<=?3`).bind(owner, now, new Date(Date.now() - 120000).toISOString()).run();
  return Boolean(result.meta.changes);
}

async function bootstrapSubscribers(db: D1Database, site: string): Promise<void> {
  const cursor = await newsletterState<number>(db, 'waitlist-cursor') ?? 0;
  const rows = await db.prepare('SELECT id,email FROM waitlist_signups WHERE id>?1 ORDER BY id LIMIT 100')
    .bind(cursor).all<{ id: number; email: string }>();
  for (const row of rows.results) await requestConfirmation(db, row.email, site, { skipExisting: true });
  if (rows.results.length) await setNewsletterState(db, 'waitlist-cursor', rows.results.at(-1)!.id);
}

function eligible(item: OutboxItem): boolean {
  if (workEmailError(item.email)) return false;
  if (item.kind === 'digest') return item.subscriber_status === 'confirmed';
  return item.subscriber_status === 'pending' && item.id === `confirm-${item.confirmation_hash}`
    && Date.parse(item.confirmation_expires_at ?? '') >= Date.now();
}

async function defer(db: D1Database, item: OutboxItem, error: unknown): Promise<boolean> {
  const http = error instanceof SourceHttpError ? error : null;
  const permanent = http && http.status >= 400 && http.status < 500 && ![408, 409, 429].includes(http.status);
  const delay = Math.max(300000 * 2 ** Math.min(item.attempts, 4), http?.retryAfterMs ?? 0);
  const message = http ? `Resend HTTP ${http.status}` : 'Resend response unavailable; same idempotency key retained';
  await db.prepare(`UPDATE newsletter_outbox SET status=?2,last_error=?3,next_attempt_at=?4 WHERE id=?1 AND status!='cancelled'`)
    .bind(item.id, permanent || item.attempts + 1 >= 5 ? 'failed' : 'pending', message, new Date(Date.now() + delay).toISOString()).run();
  return Boolean(http && [401, 403, 429].includes(http.status));
}

async function deliverItem(env: EnvBindings & { DB: D1Database }, item: OutboxItem, fetchFn: typeof fetch, deadline: number): Promise<boolean> {
  if (!eligible(item)) {
    await env.DB.prepare("UPDATE newsletter_outbox SET status='cancelled' WHERE id=?1").bind(item.id).run();
    return false;
  }
  if (item.first_attempt_at && Date.now() - Date.parse(item.first_attempt_at) >= RETRY_WINDOW_MS) {
    await env.DB.prepare("UPDATE newsletter_outbox SET status='review',last_error='Automatic retry window expired; verify provider before retry' WHERE id=?1").bind(item.id).run();
    return false;
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`UPDATE newsletter_outbox SET status='sending',attempts=attempts+1,
    first_attempt_at=COALESCE(first_attempt_at,?2),next_attempt_at=?3 WHERE id=?1 AND status!='cancelled'`)
    .bind(item.id, now, new Date(Date.now() + 120000).toISOString()).run();
  try {
    const payload = JSON.parse(item.payload_json) as MailPayload;
    const result = await sourceRequest(fetchFn, 'https://api.resend.com/emails', Math.min(8000, deadline - Date.now()), {
      method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
        'Idempotency-Key': `newsletter/${item.id}` }, body: JSON.stringify(payload) });
    const body = JSON.parse(result.body) as { id?: string };
    if (!body.id || typeof body.id !== 'string') throw new Error('Missing provider acceptance ID');
    await env.DB.prepare("UPDATE newsletter_outbox SET status='accepted',provider_id=?2,accepted_at=?3,last_error=NULL,payload_json='{}' WHERE id=?1")
      .bind(item.id, body.id, new Date().toISOString()).run();
    return false;
  } catch (error) { return defer(env.DB, item, error); }
}

async function deliverPending(env: EnvBindings & { DB: D1Database }, fetchFn: typeof fetch, deadline: number): Promise<void> {
  const rows = await env.DB.prepare(`SELECT o.*,s.email,s.status AS subscriber_status,s.confirmation_hash,s.confirmation_expires_at
    FROM newsletter_outbox o JOIN newsletter_subscribers s ON s.id=o.subscriber_id
    WHERE o.status IN ('pending','sending') AND o.next_attempt_at<=?1 ORDER BY o.created_at,o.id LIMIT 20`)
    .bind(new Date().toISOString()).all<OutboxItem>();
  for (const item of rows.results) {
    if (deadline - Date.now() < 1000) break;
    // Re-check eligibility just before sending so queued work respects an unsubscribe.
    const current = await env.DB.prepare('SELECT status AS subscriber_status,confirmation_hash,confirmation_expires_at FROM newsletter_subscribers WHERE id=?1')
      .bind(item.subscriber_id).first<Pick<OutboxItem, 'subscriber_status' | 'confirmation_hash' | 'confirmation_expires_at'>>();
    if (current) Object.assign(item, current);
    else item.subscriber_status = 'suppressed';
    if (await deliverItem(env, item, fetchFn, deadline)) break;
    if (rows.results.length > 1 && deadline - Date.now() >= 1000) await new Promise(resolve => setTimeout(resolve, 650));
  }
}

export async function newsletterHealth(env: EnvBindings) {
  if (!env.DB) return { configured: false, enabled: false, subscribers: [], deliveries: [], latest: null };
  const subscribers = await env.DB.prepare('SELECT status,count(*) AS count FROM newsletter_subscribers GROUP BY status').all();
  const deliveries = await env.DB.prepare('SELECT kind,status,count(*) AS count FROM newsletter_outbox GROUP BY kind,status').all();
  return { configured: Boolean(env.RESEND_API_KEY), enabled: env.NEWSLETTER_ENABLED === 'true',
    subscribers: subscribers.results, deliveries: deliveries.results,
    latest: await newsletterState(env.DB, 'latest'), schedule: 'Monday 13:00 UTC / 20:00 Bangkok' };
}

export async function runNewsletterJobs(env: EnvBindings, fetchFn: typeof fetch = fetch): Promise<void> {
  if (env.NEWSLETTER_ENABLED !== 'true' || !env.DB || !env.RESEND_API_KEY) return;
  const owner = crypto.randomUUID();
  if (!await acquireNewsletter(env.DB, owner)) return;
  try {
    if (!await newsletterState(env.DB, 'initialized')) await setNewsletterState(env.DB, 'initialized', { at: new Date().toISOString() });
    const site = newsletterSite(env);
    await bootstrapSubscribers(env.DB, site);
    await enqueueEdition(env.DB, site);
    await deliverPending({ ...env, DB: env.DB }, fetchFn, Date.now() + 20000);
    await setNewsletterState(env.DB, 'latest', { status: 'completed', finishedAt: new Date().toISOString() });
  } catch {
    await setNewsletterState(env.DB, 'latest', { status: 'failed', finishedAt: new Date().toISOString(),
      error: 'Newsletter job could not complete; inspect outbox and provider status.' });
  } finally {
    await env.DB.prepare("DELETE FROM newsletter_state WHERE key='lease' AND value=?1").bind(owner).run();
  }
}
