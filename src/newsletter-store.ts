import type { EnvBindings } from './app';
import { sha256Hex } from './ingestion';
import { confirmationMail, digestMail, type DigestContent, type DigestIncident, type MailPayload } from './newsletter-content';
import { workEmailError } from './work-email';

export type Subscriber = { id: number; email: string; status: string; unsubscribe_token: string;
  confirmation_hash: string | null; confirmation_expires_at: string | null; last_confirmation_at: string | null };
export const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
export function newsletterSite(env: EnvBindings): string {
  const url = new URL(env.SITE_URL ?? 'https://aisecurityradar.com');
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('Newsletter requires an HTTPS site URL');
  return url.origin;
}
function randomToken(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function newsletterState<T>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT value FROM newsletter_state WHERE key=?1').bind(key).first<{ value: string }>();
  return row ? JSON.parse(row.value) as T : null;
}
export async function setNewsletterState(db: D1Database, key: string, value: unknown): Promise<void> {
  await db.prepare(`INSERT INTO newsletter_state(key,value,updated_at) VALUES (?1,?2,?3)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(key, JSON.stringify(value), new Date().toISOString()).run();
}
async function queueMail(db: D1Database, id: string, subscriberId: number, kind: string, payload: MailPayload, editionId: string | null = null) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT OR IGNORE INTO newsletter_outbox(id,subscriber_id,edition_id,kind,payload_json,next_attempt_at,created_at)
    VALUES (?1,?2,?3,?4,?5,?6,?6)`).bind(id, subscriberId, editionId, kind, JSON.stringify(payload), now).run();
}

export async function requestConfirmation(db: D1Database, rawEmail: string, site: string): Promise<void> {
  const email = rawEmail.trim().toLowerCase();
  if (workEmailError(email)) return;
  const old = await db.prepare('SELECT * FROM newsletter_subscribers WHERE email=?1').bind(email).first<Subscriber>();
  if (old?.status === 'confirmed' || old?.status === 'suppressed') return;
  if (old?.last_confirmation_at && Date.now() - Date.parse(old.last_confirmation_at) < 3600000) return;
  const token = randomToken(), hash = await sha256Hex(token), now = new Date().toISOString();
  const expires = new Date(Date.now() + 7 * 86400000).toISOString();
  const unsubscribeToken = old?.unsubscribe_token ?? randomToken();
  const payload = confirmationMail(email, `${site}/newsletter/confirm?token=${token}`,
    `${site}/newsletter/unsubscribe?token=${unsubscribeToken}`);
  await db.batch([db.prepare(`INSERT INTO newsletter_subscribers(email,status,confirmation_hash,confirmation_expires_at,unsubscribe_token,created_at,updated_at,last_confirmation_at)
    VALUES (?1,'pending',?2,?3,?4,?5,?5,?5) ON CONFLICT(email) DO UPDATE SET status='pending',
    confirmation_hash=excluded.confirmation_hash,confirmation_expires_at=excluded.confirmation_expires_at,
    updated_at=excluded.updated_at,last_confirmation_at=excluded.last_confirmation_at
    WHERE newsletter_subscribers.status NOT IN ('confirmed','suppressed')
      AND (newsletter_subscribers.last_confirmation_at IS NULL OR newsletter_subscribers.last_confirmation_at<=?6)`)
    .bind(email, hash, expires, unsubscribeToken, now, new Date(Date.now() - 3600000).toISOString()),
    db.prepare(`INSERT OR IGNORE INTO newsletter_outbox(id,subscriber_id,kind,payload_json,next_attempt_at,created_at)
      SELECT ?1,id,'confirmation',?2,?3,?3 FROM newsletter_subscribers WHERE email=?4 AND confirmation_hash=?5`)
      .bind(`confirm-${hash}`, JSON.stringify(payload), now, email, hash),
  ]);
}

export async function confirmSubscriber(db: D1Database, token: string): Promise<boolean> {
  if (!TOKEN_PATTERN.test(token)) return false;
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE newsletter_subscribers SET status='confirmed',confirmed_at=?2,updated_at=?2
    WHERE confirmation_hash=?1 AND confirmation_expires_at>=?2 AND status='pending'`)
    .bind(await sha256Hex(token), now).run();
  if (result.meta.changes) return true;
  return Boolean(await db.prepare("SELECT id FROM newsletter_subscribers WHERE confirmation_hash=?1 AND status='confirmed'")
    .bind(await sha256Hex(token)).first());
}

export async function unsubscribe(db: D1Database, token: string): Promise<void> {
  if (!TOKEN_PATTERN.test(token)) return;
  await db.batch([
    db.prepare("UPDATE newsletter_subscribers SET status='unsubscribed',updated_at=?2 WHERE unsubscribe_token=?1 AND status!='suppressed'")
      .bind(token, new Date().toISOString()),
    db.prepare(`UPDATE newsletter_outbox SET status='cancelled' WHERE subscriber_id IN
      (SELECT id FROM newsletter_subscribers WHERE unsubscribe_token=?1) AND status IN ('pending','sending')`).bind(token),
  ]);
}

export function weeklyWindow(now = Date.now()): { id: string; start: string; end: string } {
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
  monday.setUTCHours(13, 0, 0, 0);
  if (monday.getTime() > now) monday.setUTCDate(monday.getUTCDate() - 7);
  return { id: `weekly-${monday.toISOString().slice(0, 10)}`, end: monday.toISOString(),
    start: new Date(monday.getTime() - 7 * 86400000).toISOString() };
}

export async function digestContent(db: D1Database, start: string, end: string): Promise<DigestContent> {
  const total = await db.prepare(`SELECT count(*) AS count FROM draft_posts d JOIN ingested_events e ON e.id=d.event_id
    WHERE d.status='published' AND d.published_at>=?1 AND d.published_at<?2 AND d.slug IS NOT NULL`)
    .bind(start, end).first<{ count: number }>();
  const rows = await db.prepare(`SELECT COALESCE(NULLIF(d.headline,''),e.title) AS title,d.slug,
    COALESCE(d.enriched_summary,e.summary) AS summary,COALESCE(e.severity,'medium') AS severity,
    e.source,e.url AS source_url,e.published_at AS disclosed_at,d.enriched_remedy_json
    FROM draft_posts d JOIN ingested_events e ON e.id=d.event_id
    WHERE d.status='published' AND d.published_at>=?1 AND d.published_at<?2 AND d.slug IS NOT NULL
    ORDER BY CASE e.severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      COALESCE(e.published_at,d.published_at) DESC,d.id DESC LIMIT 5`).bind(start, end)
    .all<DigestIncident & { enriched_remedy_json: string | null }>();
  const incidents = rows.results.map(row => {
    let remedy: string | null = null;
    try { const values: unknown = JSON.parse(row.enriched_remedy_json ?? '[]');
      if (Array.isArray(values) && typeof values[0] === 'string') remedy = values[0]; } catch { /* Use the cited advisory if no structured remedy exists. */ }
    return { ...row, summary: row.summary ?? '', remedy };
  });
  return { start, end, total: total?.count ?? 0, incidents };
}

export async function enqueueEdition(db: D1Database, site: string, now = Date.now()): Promise<void> {
  const window = weeklyWindow(now);
  const initialized = await newsletterState<{ at: string }>(db, 'initialized');
  if (!initialized || Date.parse(window.end) < Date.parse(initialized.at)) return;
  if (!await db.prepare('SELECT id FROM newsletter_editions WHERE id=?1').bind(window.id).first()) {
    const content = await digestContent(db, window.start, window.end);
    await db.prepare('INSERT OR IGNORE INTO newsletter_editions(id,window_start,window_end,content_json,created_at) VALUES (?1,?2,?3,?4,?5)')
      .bind(window.id, window.start, window.end, JSON.stringify(content), new Date().toISOString()).run();
  }
  const edition = await db.prepare('SELECT content_json,created_at FROM newsletter_editions WHERE id=?1').bind(window.id)
    .first<{ content_json: string; created_at: string }>();
  if (!edition) return;
  const content = JSON.parse(edition.content_json) as DigestContent;
  if (!content.total) return;
  const subscribers = await db.prepare(`SELECT s.* FROM newsletter_subscribers s WHERE s.status='confirmed' AND s.confirmed_at<=?2
    AND NOT EXISTS(SELECT 1 FROM newsletter_outbox o WHERE o.subscriber_id=s.id AND o.edition_id=?1) LIMIT 100`)
    .bind(window.id, edition.created_at).all<Subscriber>();
  for (const subscriber of subscribers.results) if (!workEmailError(subscriber.email))
    await queueMail(db, `${window.id}-${subscriber.id}`, subscriber.id, 'digest',
      digestMail(subscriber.email, content, site, `${site}/newsletter/unsubscribe?token=${subscriber.unsubscribe_token}`), window.id);
}
