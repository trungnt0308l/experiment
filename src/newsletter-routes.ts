import type { Hono, Context } from 'hono';
import type { EnvBindings } from './app';
import { sha256Hex } from './ingestion';
import { escapeEmail, digestMail } from './newsletter-content';
import { confirmSubscriber, digestContent, newsletterSite, TOKEN_PATTERN, unsubscribe, type Subscriber } from './newsletter-store';
import { newsletterHealth, runNewsletterJobs } from './newsletter-delivery';

type NewsletterContext = Context<{ Bindings: EnvBindings }>;
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeEmail(title)} | AI Security Radar</title></head>
    <body style="font-family:Arial,sans-serif;background:#f7f5ef;color:#1c1915;line-height:1.6;margin:0"><main style="max-width:640px;margin:60px auto;padding:24px"><a href="/">AI Security Radar</a><h1>${escapeEmail(title)}</h1>${body}</main></body></html>`;
}
function actionForm(action: string, token: string, label: string): string {
  return `<form method="post" action="${action}"><input type="hidden" name="token" value="${escapeEmail(token)}"><button style="padding:12px 20px;background:#135d7a;color:white;border:0;font-size:16px;cursor:pointer" type="submit">${label}</button></form>`;
}
async function bodyToken(c: NewsletterContext): Promise<string> {
  try { const body = await c.req.parseBody(); return typeof body.token === 'string' ? body.token : ''; } catch { return ''; }
}

export function registerNewsletterRoutes(app: Hono<{ Bindings: EnvBindings }>, authorized: (c: NewsletterContext) => boolean): void {
  app.use('/newsletter/*', async (c, next) => { c.header('Cache-Control', 'no-store'); c.header('X-Robots-Tag', 'noindex, nofollow'); await next(); });
  app.get('/newsletter/confirm', async (c) => {
    const token = c.req.query('token') ?? '';
    const subscriber = c.env.DB && TOKEN_PATTERN.test(token) ? await c.env.DB.prepare('SELECT * FROM newsletter_subscribers WHERE confirmation_hash=?1')
      .bind(await sha256Hex(token)).first<Subscriber>() : null;
    if (subscriber?.status === 'confirmed') return c.html(page('You are subscribed', '<p>Your weekly digest arrives on Mondays at 13:00 UTC (20:00 Bangkok).</p>'));
    if (!subscriber || subscriber.status !== 'pending' || Date.parse(subscriber.confirmation_expires_at ?? '') < Date.now())
      return c.html(page('This confirmation link has expired', '<p>Use the work-email form on the homepage to request a new confirmation.</p>'), 410);
    return c.html(page('Confirm your weekly digest', '<p>Receive one source-cited AI security roundup every Monday at 13:00 UTC (20:00 Bangkok). You can unsubscribe at any time.</p>'
      + actionForm('/newsletter/confirm', token, 'Confirm my subscription')));
  });
  app.post('/newsletter/confirm', async (c) => {
    const confirmed = c.env.DB && await confirmSubscriber(c.env.DB, await bodyToken(c));
    return c.html(page(confirmed ? 'You are subscribed' : 'This confirmation link has expired', confirmed
      ? '<p>Your first eligible weekly digest will arrive on a Monday. Browse the <a href="/incidents">incident archive</a> while you wait.</p>'
      : '<p>Request a new confirmation using the work-email form on the homepage.</p>'), confirmed ? 200 : 410);
  });
  app.get('/newsletter/unsubscribe', (c) => {
    const token = c.req.query('token') ?? '';
    if (!TOKEN_PATTERN.test(token)) return c.html(page('Invalid unsubscribe link', '<p>Use the unsubscribe link in your email, or contact security@aisecurityradar.com.</p>'), 400);
    return c.html(page('Unsubscribe from the weekly digest', '<p>You will stop receiving digest and confirmation emails.</p>'
      + actionForm(`/newsletter/unsubscribe?token=${encodeURIComponent(token)}`, token, 'Unsubscribe')));
  });
  app.post('/newsletter/unsubscribe', async (c) => {
    const token = c.req.query('token') ?? await bodyToken(c);
    if (c.env.DB) await unsubscribe(c.env.DB, token);
    // RFC 8058 one-click clients receive an empty successful response; no login or redirect.
    return c.body(null, 200);
  });
  registerAdminNewsletter(app, authorized);
}

function registerAdminNewsletter(app: Hono<{ Bindings: EnvBindings }>, authorized: (c: NewsletterContext) => boolean): void {
  app.get('/api/admin/newsletter/health', async c => authorized(c) ? c.json({ ok: true, newsletter: await newsletterHealth(c.env) }) : c.json({ ok: false }, 401));
  app.get('/api/admin/newsletter/preview', async (c) => {
    if (!authorized(c)) return c.json({ ok: false }, 401);
    if (!c.env.DB) return c.json({ ok: false, error: 'Database unavailable' }, 503);
    const end = new Date().toISOString(), start = new Date(Date.now() - 7 * 86400000).toISOString();
    const content = await digestContent(c.env.DB, start, end);
    const mail = digestMail('preview@example.com', content, newsletterSite(c.env), 'https://aisecurityradar.com/newsletter/unsubscribe?token=preview');
    return c.json({ ok: true, content, subject: mail.subject, html: mail.html, text: mail.text, dryRun: true });
  });
  app.post('/api/admin/newsletter/run', async (c) => {
    if (!authorized(c)) return c.json({ ok: false }, 401);
    await runNewsletterJobs(c.env);
    return c.json({ ok: true, newsletter: await newsletterHealth(c.env) });
  });
}
