import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { ingestionHealth, previewBackfill } from '../src/ingestion-runtime';
import { sendIngestionAlerts } from '../src/ingestion-alerts';
import { writeState } from '../src/ingestion-storage';
import { createTestDb, seedIncidentRows } from './helpers/db';
import { renderAdminOpsPage } from '../src/ui';
import { Script } from 'node:vm';
import { enrichPendingDrafts } from '../src/ingestion-enrichment';

afterEach(() => vi.restoreAllMocks());
const auth = { Authorization: 'Bearer test-admin' };
const dates = { from: '2026-02-01T00:00:00Z', to: '2026-02-28T00:00:00Z', sources: ['ghsa'] };

describe('operator safety and visibility', () => {
  test('health and recovery endpoints require authentication and do not cache responses', async () => {
    const app = createApp();
    const { db } = createTestDb();
    const env = { DB: db, ADMIN_API_TOKEN: 'test-admin', ENABLE_HN_SOURCE: 'false' };
    expect((await app.request('/api/admin/ingestion/health', {}, env)).status).toBe(401);
    expect((await app.request('/api/admin/ingestion/backfill', { method: 'POST' }, env)).status).toBe(401);
    const health = await app.request('/api/admin/ingestion/health', { headers: auth }, env);
    expect(health.headers.get('cache-control')).toBe('no-store');
    expect((await health.json() as { health: { errors: string[] } }).health.errors).toContain('Hourly cron heartbeat missing or stale');
    const invalid = await app.request('/api/admin/ingestion/backfill', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dates, from: dates.to, to: dates.from }) }, env);
    expect(invalid.status).toBe(400);
  });

  test('a backfill preview is read-only and retains source severity and disclosure dates', async () => {
    const fixture = createTestDb();
    const fetchFn: typeof fetch = async () => new Response(JSON.stringify([{ ghsa_id: 'GHSA-preview',
      summary: 'LLM security vulnerability', description: 'full details', severity: 'high',
      html_url: 'https://github.com/advisories/GHSA-preview', published_at: dates.from }]));
    const preview = await previewBackfill({ DB: fixture.db }, fetchFn, { ...dates, sources: ['ghsa'] });
    expect(preview.candidates[0].sourceSeverity).toBe('high');
    expect(fixture.state.size).toBe(0);
    expect(fixture.events).toHaveLength(0);
  });

  test('health reports stalled retries independently of a successful quiet cron', async () => {
    const fixture = createTestDb();
    await writeState(fixture.db, 'run:latest:cron', { status: 'healthy', finishedAt: new Date().toISOString() });
    fixture.sqlite.prepare(`INSERT INTO ingestion_items(source,external_id,payload_json,payload_hash,status,first_seen_at,last_seen_at)
      VALUES ('ghsa','stuck','{}','hash','retry',?,?)`).run('2026-02-20T00:00:00Z', '2026-02-20T00:00:00Z');
    const health = await ingestionHealth({ DB: fixture.db, ENABLE_HN_SOURCE: 'false' });
    expect(health.errors).toContain('Ingestion backlog has waited more than six hours');
    expect(health.retrying).toBe(1);
  });

  test('recovery cannot silently replace a different active range and can be stopped', async () => {
    const fixture = createTestDb();
    await writeState(fixture.db, 'backfill:active', { ...dates, enabled: true });
    const app = createApp();
    const env = { DB: fixture.db, ADMIN_API_TOKEN: 'test-admin' };
    const res = await app.request('/api/admin/ingestion/backfill', { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...dates, from: '2026-02-02T00:00:00Z', dryRun: false }) }, env);
    expect(res.status).toBe(409);
    expect((await app.request('/api/admin/ingestion/backfill/stop', { method: 'POST', headers: auth }, env)).status).toBe(200);
    expect(JSON.parse(fixture.state.get('backfill:active')!.value).enabled).toBe(false);
  });

  test('an explicit reset clears durable checkpoints/inbox and cannot race an active ingestion lease', async () => {
    const fixture = createTestDb();
    const app = createApp();
    const env = { DB: fixture.db, ADMIN_API_TOKEN: 'test-admin' };
    await writeState(fixture.db, 'scan:ghsa:default', { start: dates.from });
    fixture.sqlite.prepare('INSERT INTO ingestion_state(key,value,updated_at) VALUES (?,?,?)').run('lock:cron', 'other-owner', new Date().toISOString());
    expect((await app.request('/api/admin/ingestion/reset', { method: 'POST', headers: auth }, env)).status).toBe(409);
    fixture.sqlite.exec("DELETE FROM ingestion_state WHERE key='lock:cron'");
    expect((await app.request('/api/admin/ingestion/reset', { method: 'POST', headers: auth }, env)).status).toBe(200);
    expect(fixture.state.size).toBe(0);
  });

  test('deduplicates delivered alerts but retries failed delivery', async () => {
    const fixture = createTestDb();
    const env = { DB: fixture.db, INGESTION_ALERTS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '123' };
    let calls = 0;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchFn: typeof fetch = async () => { calls += 1; return new Response('', { status: calls === 1 ? 503 : 200 }); };
    await sendIngestionAlerts(env, fetchFn);
    expect(fixture.state.has('alert:telegram')).toBe(false);
    await sendIngestionAlerts(env, fetchFn);
    await sendIngestionAlerts(env, fetchFn);
    expect(calls).toBe(2);
  });

  test('intentional quota pauses remain visible without sending outage alerts', async () => {
    const fixture = createTestDb();
    await writeState(fixture.db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
    await writeState(fixture.db, 'health:nvd', { errors: ['NVD local request quota reached; scan resumes next run'], warnings: [] });
    let calls = 0;
    await sendIngestionAlerts({ DB: fixture.db, INGESTION_ALERTS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '123' },
      async () => { calls += 1; return new Response(''); });
    expect(calls).toBe(0);
  });

  test('the admin recovery controls render valid executable JavaScript', () => {
    const html = renderAdminOpsPage();
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(() => new Script(script)).not.toThrow();
    expect(html).toContain('Preview Recovery');
    expect(html).toContain('aria-live="polite"');
  });

  test('failed optional enrichment leaves publication intact and is retryable after cooldown', async () => {
    const fixture = createTestDb();
    fixture.sqlite.prepare(`INSERT INTO ingested_events(source,external_id,title,url,summary,published_at,fingerprint,created_at)
      VALUES ('ghsa','GHSA-enrich','LLM security vulnerability','https://example.com','LLM issue',?,'enrich',?)`)
      .run(dates.from, dates.from);
    fixture.sqlite.prepare(`INSERT INTO draft_posts(event_id,status,headline,linkedin_text,x_text,tags,published_at,created_at)
      VALUES (1,'published','LLM issue','','','',?,?)`).run(dates.from, dates.from);
    const env = { DB: fixture.db, OPENAI_API_KEY: 'test-only', OPENAI_MODEL: 'gpt-5-mini' };
    const failed = await enrichPendingDrafts(env, async () => new Response('', { status: 429 }), Date.now() + 1000, 2);
    expect(failed.warnings).toHaveLength(1);
    expect(fixture.sqlite.prepare('SELECT status,enriched_at FROM draft_posts').get()).toMatchObject({ status: 'published', enriched_at: null });
    let calls = 0;
    const successful: typeof fetch = async () => { calls += 1; return new Response(JSON.stringify({ output_text: JSON.stringify({
      summary: 'LLM vulnerability in the affected package.', impact: 'Access to application data may be exposed.', remedy: ['Upgrade.', 'Limit access.', 'Review logs.'],
    }) })); };
    expect((await enrichPendingDrafts(env, successful, Date.now() + 1000, 2)).calls).toBe(0);
    fixture.sqlite.exec("DELETE FROM ingestion_state WHERE key='enrichment:cooldown'");
    expect((await enrichPendingDrafts(env, successful, Date.now() + 1000, 2)).calls).toBe(1);
    expect(calls).toBe(1);
    expect(fixture.sqlite.prepare('SELECT enriched_summary FROM draft_posts').get()?.enriched_summary).toContain('LLM vulnerability');
  });
});

test('archive, detail and sitemap retain access beyond the former 200-record cutoff', async () => {
  const rows = Array.from({ length: 215 }, (_, index) => ({ draft_id: index + 1, slug: `incident-${index + 1}`,
    title: `LLM security vulnerability ${index + 1}`, url: `https://example.com/${index + 1}`,
    event_published_at: new Date(Date.parse('2026-02-28T00:00:00Z') - index * 86400000).toISOString(),
    published_at: '2026-02-28T00:00:00Z', created_at: '2026-02-28T00:00:00Z' }));
  const app = createApp();
  const env = { DB: seedIncidentRows(rows) };
  const detail = await app.request('/incidents/incident-215', {}, env);
  expect(detail.status).toBe(200);
  expect(await detail.text()).toContain('Source disclosure:');
  const page = await app.request('/incidents/page/22', {}, env);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('incident-215');
  expect(await (await app.request('/sitemap.xml', {}, env)).text()).toContain('/incidents/incident-215');
});
