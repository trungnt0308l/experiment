import { afterEach, describe, expect, test, vi } from 'vitest';
import { Script } from 'node:vm';
import { createApp, type EnvBindings } from '../src/app';
import { workEmailError } from '../src/work-email';
import { confirmationMail, digestMail, plainEmail } from '../src/newsletter-content';
import { confirmSubscriber, digestContent, enqueueEdition, newsletterSite, requestConfirmation,
  setNewsletterState, unsubscribe, weeklyWindow } from '../src/newsletter-store';
import { newsletterHealth, runNewsletterJobs } from '../src/newsletter-delivery';
import { createTestDb, seedIncidentRows } from './helpers/db';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const site = 'https://aisecurityradar.com';
function env(db: D1Database): EnvBindings {
  return { DB: db, RESEND_API_KEY: 'test-key', NEWSLETTER_ENABLED: 'true', SITE_URL: site, ADMIN_API_TOKEN: 'admin-test' };
}
async function queued(db: D1Database) {
  return (await db.prepare('SELECT * FROM newsletter_outbox ORDER BY created_at,id').all<{
    id: string; status: string; payload_json: string; attempts: number; provider_id: string | null;
  }>()).results;
}
async function confirmation(db: D1Database, email = 'reader@company.example') {
  await requestConfirmation(db, email, site);
  const rows = await queued(db);
  const item = rows.find(row => JSON.parse(row.payload_json).to?.[0] === email)!;
  const mail = JSON.parse(item.payload_json) as { text: string };
  return { item, token: mail.text.match(/confirm\?token=([a-f0-9]{64})/)![1] };
}
function incidentDb() {
  return seedIncidentRows(Array.from({ length: 7 }, (_, index) => ({
    draft_id: index + 1, title: `Advisory ${index}`, url: `https://source.example/${index}`,
    slug: `advisory-${index}`, summary: `Summary ${index}`, severity: index === 0 ? 'high' : 'medium',
    event_published_at: '2026-01-01T00:00:00.000Z', published_at: '2026-02-26T00:00:00.000Z',
    created_at: '2026-02-26T00:00:00.000Z', enriched_remedy_json: '["Upgrade affected software"]',
  })));
}

describe('work email policy', () => {
  test.each(['reader@gmail.com', 'USER@HOTMAIL.COM', 'person@outlook.co.uk', 'p@sub.mail.ru',
    'p@icloud.com', 'p@proton.me', 'p@mailinator.com', 'p@yahoo.co.jp'])('rejects personal or disposable address %s', value => {
    expect(workEmailError(value)).toContain('company email');
  });
  test.each(['', 'missing-at.example', 'a@@company.example', '.a@company.example', 'a..b@company.example',
    'a@localhost', 'a@-company.example', 'a@company..example', 'a@company.example.', null, 42,
    `${'a'.repeat(65)}@company.example`])('rejects malformed email %s', value => {
    expect(workEmailError(value)).toContain('valid work email');
  });
  test.each(['person@company.example', ' Team+security@Sub.Company.example ', 'p@gmail-company.com',
    'p@companygmail.com', 'a@googleworkspace.customer'])('accepts custom company domain %s', value => {
    expect(workEmailError(value)).toBeNull();
  });
  test('requires HTTPS outside localhost', () => {
    expect(newsletterSite({ SITE_URL: 'http://localhost:8787/path' })).toBe('http://localhost:8787');
    expect(() => newsletterSite({ SITE_URL: 'http://company.example' })).toThrow('HTTPS');
  });
});

describe('subscription lifecycle', () => {
  test('queues one confirmation, stores a hash, and throttles repeated requests', async () => {
    const { db } = createTestDb();
    const { token } = await confirmation(db);
    await requestConfirmation(db, ' READER@COMPANY.EXAMPLE ', site);
    await requestConfirmation(db, 'reader@gmail.com', site);
    const subscriber = await db.prepare('SELECT * FROM newsletter_subscribers').first<{ status: string; confirmation_hash: string }>();
    expect(subscriber?.status).toBe('pending');
    expect(subscriber?.confirmation_hash).not.toBe(token);
    expect(await queued(db)).toHaveLength(1);
    expect(await confirmSubscriber(db, token)).toBe(true);
    expect(await confirmSubscriber(db, token)).toBe(true);
    await requestConfirmation(db, 'reader@company.example', site);
    expect(await queued(db)).toHaveLength(1);
  });
  test('subscriber and confirmation outbox roll back together on storage failure', async () => {
    const { db, sqlite } = createTestDb();
    sqlite.exec("CREATE TRIGGER fail_mail BEFORE INSERT ON newsletter_outbox BEGIN SELECT RAISE(ABORT,'disk unavailable'); END");
    await expect(requestConfirmation(db, 'reader@company.example', site)).rejects.toThrow('disk unavailable');
    expect(await db.prepare('SELECT count(*) AS n FROM newsletter_subscribers').first('n')).toBe(0);
  });
  test('GET confirmation is scanner-safe; POST explicitly confirms; unsubscribe cancels queued mail', async () => {
    const { db } = createTestDb(), app = createApp(), bindings = env(db);
    const { token } = await confirmation(db);
    const get = await app.request(`/newsletter/confirm?token=${token}`, {}, bindings);
    expect(get.status).toBe(200);
    expect(get.headers.get('cache-control')).toContain('no-store');
    expect(get.headers.get('referrer-policy')).toBe('no-referrer');
    expect(await get.text()).toContain('Confirm my subscription');
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('pending');
    const post = await app.request('/newsletter/confirm', { method: 'POST', body: new URLSearchParams({ token }) }, bindings);
    expect(post.status).toBe(200);
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('confirmed');
    const unsub = await db.prepare('SELECT unsubscribe_token AS token FROM newsletter_subscribers').first<string>('token');
    await app.request(`/newsletter/unsubscribe?token=${unsub}`, {}, bindings);
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('confirmed');
    const response = await app.request(`/newsletter/unsubscribe?token=${unsub}`, {
      method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    }, bindings);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('');
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('unsubscribed');
    expect((await queued(db))[0].status).toBe('cancelled');
    expect(await confirmSubscriber(db, token)).toBe(false);
  });
  test('expired and malformed tokens cannot confirm; a later explicit signup can request a new token', async () => {
    const { db } = createTestDb();
    const { token } = await confirmation(db);
    await db.prepare("UPDATE newsletter_subscribers SET confirmation_expires_at='2026-02-27T00:00:00.000Z',last_confirmation_at='2026-02-27T00:00:00.000Z'").run();
    expect(await confirmSubscriber(db, token)).toBe(false);
    expect(await confirmSubscriber(db, '<script>')).toBe(false);
    await requestConfirmation(db, 'reader@company.example', site);
    expect(await queued(db)).toHaveLength(2);
    expect(await confirmSubscriber(db, token)).toBe(false);
    const response = await createApp().request(`/newsletter/confirm?token=${token}`, {}, env(db));
    expect(response.status).toBe(410);
  });
  test('server rejects personal and invalid JSON payloads before storage and returns confirmation feedback for work email', async () => {
    const { db } = createTestDb(), app = createApp(), bindings = { ...env(db), RESEND_API_KEY: undefined, NEWSLETTER_ENABLED: 'false' };
    for (const [index, body] of [{ email: 'p@gmail.com', company: 'Example', role: 'Engineer' }, { email: 12 }].entries()) {
      const response = await app.request('/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': `newsletter-invalid-${index}` }, body: JSON.stringify(body) }, bindings);
      expect(response.status).toBe(400);
    }
    expect(await db.prepare('SELECT count(*) AS n FROM waitlist_signups').first('n')).toBe(0);
    const response = await app.request('/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': 'newsletter-work' },
      body: JSON.stringify({ email: 'p@company.example', company: 'Example', role: 'Engineer' }) }, env(db));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ subscription_status: 'confirmation_queued' });
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('pending');
    expect(await queued(db)).toHaveLength(1);
  });
});

describe('weekly editions and copy', () => {
  test('uses Monday 13:00 UTC with a half-open seven day window, including the exact boundary', () => {
    expect(weeklyWindow(Date.parse('2026-10-26T12:59:59.999Z')).id).toBe('weekly-2026-10-19');
    expect(weeklyWindow(Date.parse('2026-10-26T13:00:00.000Z'))).toEqual({ id: 'weekly-2026-10-26',
      start: '2026-10-19T13:00:00.000Z', end: '2026-10-26T13:00:00.000Z' });
    expect(weeklyWindow(Date.parse('2026-11-01T23:00:00Z')).id).toBe('weekly-2026-10-26');
  });
  test('selects five published highlights by severity and retains original disclosure dates', async () => {
    const db = incidentDb();
    const content = await digestContent(db, '2026-02-23T13:00:00.000Z', '2026-03-02T13:00:00.000Z');
    expect(content.total).toBe(7);
    expect(content.incidents).toHaveLength(5);
    expect(content.incidents[0]).toMatchObject({ title: 'Advisory 0', severity: 'high', disclosed_at: '2026-01-01T00:00:00.000Z', remedy: 'Upgrade affected software' });
    expect((await digestContent(db, '2026-02-26T00:00:00.000Z', '2026-02-27T00:00:00.000Z')).total).toBe(7);
    expect((await digestContent(db, '2026-02-25T00:00:00.000Z', '2026-02-26T00:00:00.000Z')).total).toBe(0);
    const mail = digestMail('p@company.example', content, site, `${site}/newsletter/unsubscribe?token=abc`);
    expect(mail.text).toContain('earlier disclosures');
    expect(mail.text).toContain('Source disclosure: 2026-01-01');
    expect(mail.text).toContain('https://source.example/0');
    expect(mail.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });
  test('escapes hostile source content and omits executable source links', () => {
    const mail = digestMail('p@company.example', { total: 1, start: '2026-02-23', end: '2026-03-02', incidents: [{
      title: '<img onerror=alert(1)> A & B', summary: '<script>alert(1)</script>Safe <b>text</b>', slug: '<bad>',
      severity: 'high', source: 'ghsa', source_url: 'javascript:alert(1)', disclosed_at: 'bad', remedy: '<script>x()</script>Update',
    }] }, site, `${site}/newsletter/unsubscribe?token=abc`);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('javascript:');
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('A &amp; B');
    expect(plainEmail('```secret``` <style>x</style>Text')).toBe('Text');
    expect(confirmationMail('p@company.example', 'https://example.com/confirm', 'https://example.com/stop').text).toContain('seven days');
  });
  test('creates one immutable edition for confirmed subscribers, skips rollout backlog and empty weeks', async () => {
    const db = incidentDb();
    const { token } = await confirmation(db);
    await confirmSubscriber(db, token);
    const monday = Date.parse('2026-03-02T13:00:00.000Z');
    await enqueueEdition(db, site, monday);
    expect(await db.prepare('SELECT count(*) AS n FROM newsletter_editions').first('n')).toBe(0);
    await setNewsletterState(db, 'initialized', { at: '2026-02-28T00:00:00.000Z' });
    await enqueueEdition(db, site, Date.parse('2026-02-28T13:00:00Z'));
    expect(await db.prepare('SELECT count(*) AS n FROM newsletter_editions').first('n')).toBe(0);
    await enqueueEdition(db, site, monday);
    await db.prepare("UPDATE draft_posts SET headline='Edited after edition snapshot'").run();
    const second = await confirmation(db, 'later@company.example');
    await confirmSubscriber(db, second.token);
    await db.prepare("UPDATE newsletter_subscribers SET confirmed_at=?1 WHERE email='later@company.example'")
      .bind(new Date(Date.now() + 1000).toISOString()).run();
    await enqueueEdition(db, site, monday);
    expect(await db.prepare("SELECT count(*) AS n FROM newsletter_outbox WHERE kind='digest'").first('n')).toBe(1);
    expect(await db.prepare('SELECT content_json FROM newsletter_editions').first('content_json')).not.toContain('Edited after');
    await enqueueEdition(db, site, Date.parse('2026-03-09T13:00:00Z'));
    expect(await db.prepare("SELECT count(*) AS n FROM newsletter_outbox WHERE kind='digest'").first('n')).toBe(1);
  });
});

describe('Resend outbox delivery', () => {
  test('legacy cursor replay cannot resubscribe an address that opted out', async () => {
    const { db } = createTestDb();
    await confirmation(db);
    const token = await db.prepare('SELECT unsubscribe_token AS token FROM newsletter_subscribers').first<string>('token');
    await unsubscribe(db, token!);
    await db.prepare("UPDATE newsletter_subscribers SET last_confirmation_at='2026-02-01T00:00:00Z'").run();
    await db.prepare("INSERT INTO waitlist_signups(email,company,role,interests,created_at) VALUES ('reader@company.example','','','',?1)").bind(new Date().toISOString()).run();
    const fetchFn = vi.fn();
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('unsubscribed');
    expect(await queued(db)).toHaveLength(1);
  });
  test.each([401, 403, 422])('tracks permanent provider rejection HTTP %s without claiming acceptance', async status => {
    const { db } = createTestDb();
    await confirmation(db);
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status }));
    await runNewsletterJobs(env(db), fetchFn);
    expect((await queued(db))[0]).toMatchObject({ status: 'failed', provider_id: null, attempts: 1 });
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
  });
  test('operator suppression survives unsubscribe and subsequent signup attempts', async () => {
    const { db } = createTestDb();
    await confirmation(db);
    await db.prepare("UPDATE newsletter_subscribers SET status='suppressed',last_confirmation_at=NULL").run();
    const token = await db.prepare('SELECT unsubscribe_token AS token FROM newsletter_subscribers').first<string>('token');
    await unsubscribe(db, token!);
    await requestConfirmation(db, 'reader@company.example', site);
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('suppressed');
    const fetchFn = vi.fn();
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  test('bootstraps only eligible legacy signups into pending confirmation and records provider acceptance without retaining bodies', async () => {
    const { db } = createTestDb();
    for (const email of ['legacy@gmail.com', 'legacy@company.example']) await db.prepare("INSERT INTO waitlist_signups(email,company,role,interests,created_at) VALUES (?1,'Company','Security','AI security',?2)").bind(email, new Date().toISOString()).run();
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'provider-1' }), { status: 200 }));
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ 'Idempotency-Key': expect.stringMatching(/^newsletter\/confirm-/) });
    expect(JSON.parse(String(init.body)).to).toEqual(['legacy@company.example']);
    expect(await db.prepare('SELECT status FROM newsletter_subscribers').first('status')).toBe('pending');
    expect((await queued(db))[0]).toMatchObject({ status: 'accepted', provider_id: 'provider-1', payload_json: '{}' });
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(await newsletterHealth(env(db))).toMatchObject({ enabled: true, deliveries: [{ kind: 'confirmation', status: 'accepted', count: 1 }] });
  });
  test('retries ambiguous responses with the exact immutable body and key', async () => {
    const { db } = createTestDb();
    await confirmation(db);
    const fetchFn = vi.fn().mockRejectedValueOnce(new Error('network closed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'accepted-after-retry' })));
    await runNewsletterJobs(env(db), fetchFn);
    expect((await queued(db))[0]).toMatchObject({ status: 'pending', attempts: 1 });
    await db.prepare("UPDATE newsletter_outbox SET next_attempt_at='2026-02-01T00:00:00Z'").run();
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn.mock.calls[1][1].body).toBe(fetchFn.mock.calls[0][1].body);
    expect(fetchFn.mock.calls[1][1].headers).toEqual(fetchFn.mock.calls[0][1].headers);
    expect((await queued(db))[0]).toMatchObject({ status: 'accepted', attempts: 2 });
  });
  test('stops a rate-limited batch and honors Retry-After', async () => {
    const { db } = createTestDb();
    await confirmation(db); await confirmation(db, 'second@company.example');
    const fetchFn = vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '900' } }));
    const before = Date.now();
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect((await queued(db)).map(row => row.attempts).sort()).toEqual([0, 1]);
    const due = await db.prepare('SELECT next_attempt_at AS due FROM newsletter_outbox WHERE attempts=1').first<string>('due');
    expect(Date.parse(due!) - before).toBeGreaterThanOrEqual(900000);
  });
  test('quarantines attempts beyond the provider idempotency window and cancels obsolete confirmation tokens', async () => {
    const { db } = createTestDb();
    await confirmation(db);
    await db.prepare("UPDATE newsletter_outbox SET first_attempt_at='2026-02-27T12:00:00.000Z'").run();
    const fetchFn = vi.fn();
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await queued(db))[0].status).toBe('review');
    await db.prepare("UPDATE newsletter_subscribers SET last_confirmation_at='2026-02-27T00:00:00.000Z'").run();
    await confirmation(db);
    await db.prepare("UPDATE newsletter_outbox SET status='pending' WHERE status='review'").run();
    fetchFn.mockResolvedValue(new Response(JSON.stringify({ id: 'new-token' })));
    await runNewsletterJobs(env(db), fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect((await queued(db)).map(row => row.status).sort()).toEqual(['accepted', 'cancelled']);
  });
  test('unsubscribed recipients and disabled/configuration-missing jobs never send', async () => {
    const { db } = createTestDb();
    await confirmation(db);
    const token = await db.prepare('SELECT unsubscribe_token AS token FROM newsletter_subscribers').first<string>('token');
    await unsubscribe(db, token!);
    const fetchFn = vi.fn();
    await runNewsletterJobs(env(db), fetchFn);
    await runNewsletterJobs({ ...env(db), NEWSLETTER_ENABLED: 'false' }, fetchFn);
    await runNewsletterJobs({ ...env(db), RESEND_API_KEY: undefined }, fetchFn);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('newsletter operator controls', () => {
  test('signup feedback reflects queued, pending, confirmed and suppressed subscriptions without promising nonexistent mail', async () => {
    const { db } = createTestDb(), app = createApp(), bindings = env(db);
    const signup = async () => {
      const response = await app.request('/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': 'newsletter-feedback' },
        body: JSON.stringify({ email: 'status@company.example' }) }, bindings);
      return response.json();
    };
    expect(await signup()).toMatchObject({ subscription_status: 'confirmation_queued' });
    expect(await signup()).toMatchObject({ subscription_status: 'confirmation_pending' });
    await db.prepare("UPDATE newsletter_subscribers SET status='confirmed'").run();
    expect(await signup()).toMatchObject({ subscription_status: 'confirmed' });
    await db.prepare("UPDATE newsletter_subscribers SET status='suppressed'").run();
    expect(await signup()).toMatchObject({ subscription_status: 'unavailable' });
    expect(await queued(db)).toHaveLength(1);
  });
  test('protects preview and health; preview is read-only and frontend scripts parse', async () => {
    const db = incidentDb(), app = createApp(), bindings = env(db);
    for (const endpoint of ['health', 'preview', 'run']) {
      const response = await app.request(`/api/admin/newsletter/${endpoint}`, { method: endpoint === 'run' ? 'POST' : 'GET' }, bindings);
      expect(response.status).toBe(401);
    }
    const preview = await app.request('/api/admin/newsletter/preview', { headers: { authorization: 'Bearer admin-test' } }, bindings);
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({ dryRun: true, content: { total: 7 } });
    expect(await queued(db)).toHaveLength(0);
    expect(await db.prepare('SELECT count(*) AS n FROM newsletter_editions').first('n')).toBe(0);
    for (const path of ['/', '/admin/ops']) {
      const html = await (await app.request(path, {}, bindings)).text();
      for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
        if (!script[0].includes('application/ld+json')) expect(() => new Script(script[1])).not.toThrow();
    }
  });
});
