import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runIngestionPipeline, type SourceEvent } from '../src/ingestion';
import { writeState } from '../src/ingestion-storage';
import { sendIngestionAlerts } from '../src/ingestion-alerts';
import { fetchSourcePage, NVD_QUERIES } from '../src/ingestion-sources';
import { SourceBudgetError, SOURCE_BUDGET_MESSAGE } from '../src/ingestion-network';
import { createTestDb } from './helpers/db';

const response = (body: unknown) => new Response(JSON.stringify(body));
const range = (source: SourceEvent['source']) => ({ from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T12:00:00.000Z', sources: [source] });
const localQuota = 'NVD local request quota reached; scan resumes next run';

function paginatedNvd(onRequest: () => void): typeof fetch {
  const published = new Date(Date.now() - 3600000).toISOString();
  return async (input) => {
    onRequest();
    const url = new URL(String(input));
    const query = NVD_QUERIES.indexOf(url.searchParams.get('keywordSearch')!);
    const offset = Number(url.searchParams.get('startIndex'));
    return response({ totalResults: 100, vulnerabilities: [{ cve: { id: `CVE-2026-${10000 + query * 1000 + offset}`,
      published, descriptions: [{ lang: 'en', value: 'LLM arbitrary code execution vulnerability' }],
      metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] } } }] });
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('P1: ten hourly runs keep collecting five public NVD pages without growing outage cooldowns', async () => {
  const fixture = createTestDb();
  let calls = 0;
  const fetchFn = paginatedNvd(() => { calls++; });
  const runs = [];
  for (let hour = 0; hour < 10; hour++) {
    const before = calls;
    const result = await runIngestionPipeline({ DB: fixture.db }, fetchFn, { mode: 'cron', backfill: range('nvd') });
    const health = JSON.parse(fixture.state.get('health:nvd')!.value);
    runs.push({ calls: calls - before, streak: health.failureStreak, cooldown: health.cooldownUntil, errors: result.errors });
    vi.advanceTimersByTime(3600000);
  }
  expect(runs.map((run) => run.calls)).toEqual(Array(10).fill(5));
  expect(runs.every((run) => run.streak === 0 && !run.cooldown && !run.errors.length)).toBe(true);
  expect(fixture.events).toHaveLength(50);
  let alerts = 0;
  await sendIngestionAlerts({ DB: fixture.db, INGESTION_ALERTS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '123' },
    async () => { alerts++; return new Response(''); });
  expect(alerts).toBe(0);
});

test('a second run waits only for the rolling quota window and keeps the last actual source success', async () => {
  const fixture = createTestDb();
  let calls = 0;
  const fetchFn = paginatedNvd(() => { calls++; });
  const options = { mode: 'cron' as const, backfill: range('nvd') };
  await runIngestionPipeline({ DB: fixture.db }, fetchFn, options);
  const success = JSON.parse(fixture.state.get('health:nvd')!.value).lastSuccessAt;
  vi.advanceTimersByTime(10000);
  const paused = await runIngestionPipeline({ DB: fixture.db }, fetchFn, options);
  expect(calls).toBe(5);
  expect(paused.errors).toEqual([]);
  expect(paused.warnings.some((warning) => warning.includes(localQuota))).toBe(true);
  expect(JSON.parse(fixture.state.get('health:nvd')!.value)).toMatchObject({ lastSuccessAt: success, failureStreak: 0, incomplete: true });
  vi.advanceTimersByTime(20001);
  await runIngestionPipeline({ DB: fixture.db }, fetchFn, options);
  expect(calls).toBe(10);
  expect(fixture.events).toHaveLength(10);
});

test('a fully used local quota cannot clear a genuine failure streak without a successful request', async () => {
  const fixture = createTestDb();
  const success = new Date(Date.now() - 3600000).toISOString();
  await writeState(fixture.db, 'quota:nvd', Array(5).fill(Date.now()));
  await writeState(fixture.db, 'health:nvd', { errors: ['NVD keyword "llm": Source HTTP 503'], warnings: [],
    failureStreak: 2, lastSuccessAt: success, incomplete: true });
  let calls = 0;
  const result = await runIngestionPipeline({ DB: fixture.db }, paginatedNvd(() => { calls++; }),
    { mode: 'cron', backfill: range('nvd') });
  expect(calls).toBe(0);
  expect(result.errors).toEqual([]);
  const health = JSON.parse(fixture.state.get('health:nvd')!.value);
  expect(health).toMatchObject({ failureStreak: 2, lastSuccessAt: success });
  expect(health.cooldownUntil).toBeUndefined();
});

test('recovers an existing six-hour cooldown caused exclusively by local quota pauses', async () => {
  const fixture = createTestDb();
  await writeState(fixture.db, 'health:nvd', { errors: [`NVD keyword "llm": ${localQuota}`], warnings: [],
    failureStreak: 8, cooldownUntil: new Date(Date.now() + 6 * 3600000).toISOString(), incomplete: true });
  let calls = 0;
  await runIngestionPipeline({ DB: fixture.db }, paginatedNvd(() => { calls++; }), { mode: 'cron', backfill: range('nvd') });
  expect(calls).toBe(5);
  const health = JSON.parse(fixture.state.get('health:nvd')!.value);
  expect(health.failureStreak).toBe(0);
  expect(health.cooldownUntil).toBeUndefined();
});

test('preserves genuine persisted cooldowns when history also contains a local quota error', async () => {
  const fixture = createTestDb();
  const cooldownUntil = new Date(Date.now() + 3600000).toISOString();
  await writeState(fixture.db, 'health:nvd', { errors: [`NVD keyword "llm": ${localQuota}`, 'NVD keyword "prompt injection": Source HTTP 503'],
    warnings: [], failureStreak: 3, cooldownUntil, incomplete: true });
  let calls = 0;
  await runIngestionPipeline({ DB: fixture.db }, paginatedNvd(() => { calls++; }), { mode: 'cron', backfill: range('nvd') });
  expect(calls).toBe(0);
  expect(JSON.parse(fixture.state.get('health:nvd')!.value)).toMatchObject({ cooldownUntil, failureStreak: 3 });
});

test('genuine upstream HTTP 429 still backs off, honors Retry-After, and triggers an outage alert', async () => {
  const fixture = createTestDb();
  let calls = 0;
  const fetchFn: typeof fetch = async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '3600' } }); };
  const env = { DB: fixture.db, ENABLE_HN_SOURCE: 'false', INGESTION_ALERTS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '123' };
  const options = { mode: 'cron' as const, backfill: range('nvd') };
  const result = await runIngestionPipeline(env, fetchFn, options);
  expect(result.errors.some((error) => error.includes('Source HTTP 429'))).toBe(true);
  const health = JSON.parse(fixture.state.get('health:nvd')!.value);
  expect(health.failureStreak).toBe(1);
  expect(Date.parse(health.cooldownUntil) - Date.now()).toBe(3600000);
  const firstCalls = calls;
  await runIngestionPipeline(env, fetchFn, options);
  expect(calls).toBe(firstCalls);
  let alerts = 0;
  await sendIngestionAlerts(env, async () => { alerts++; return new Response(''); });
  expect(alerts).toBe(1);
  vi.advanceTimersByTime(3600000);
  await runIngestionPipeline(env, fetchFn, options);
  expect(calls).toBeGreaterThan(firstCalls);
  expect(JSON.parse(fixture.state.get('health:nvd')!.value).failureStreak).toBe(2);
});

test('normal and historical NVD scans retain fair progress across hourly runs without clearing state', async () => {
  const fixture = createTestDb();
  const backfill = { ...range('nvd'), enabled: true };
  await writeState(fixture.db, 'backfill:active', backfill);
  const seen = new Set<string>();
  const counts: number[] = [];
  let calls = 0;
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname.includes('services.nvd')) {
      calls++;
      if (url.searchParams.get('pubStartDate') === backfill.from) seen.add(url.searchParams.get('keywordSearch')!);
      return response({ vulnerabilities: [], totalResults: 0 });
    }
    if (url.hostname.includes('github') || url.hostname.includes('enisa')) return response([]);
    if (url.hostname.includes('cisa')) return response({ vulnerabilities: [] });
    return new Response('<rss><channel></channel></rss>');
  };
  for (let hour = 0; hour < 4; hour++) {
    const before = calls;
    const result = await runIngestionPipeline({ DB: fixture.db, ENABLE_HN_SOURCE: 'false', RSS_FEEDS: 'https://example.com/rss' }, fetchFn, { mode: 'cron' });
    expect(result.sourceStats.nvd.errors).toBe(0);
    counts.push(calls - before);
    vi.advanceTimersByTime(3600000);
  }
  expect(counts).toEqual([5, 5, 5, 5]);
  expect([...seen].sort()).toEqual([...NVD_QUERIES].sort());
  expect(JSON.parse(fixture.state.get('backfill:active')!.value).enabled).toBe(false);
});

test('historical scanning stays paused when normal collection consumes the full local NVD quota', async () => {
  const fixture = createTestDb();
  const backfill = { ...range('nvd'), enabled: true };
  await writeState(fixture.db, 'backfill:active', backfill);
  let calls = 0;
  let historicalCalls = 0;
  const nvd = paginatedNvd(() => { calls++; });
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname.includes('services.nvd')) {
      if (url.searchParams.get('pubStartDate') === backfill.from) historicalCalls++;
      return nvd(input);
    }
    if (url.hostname.includes('github') || url.hostname.includes('enisa')) return response([]);
    if (url.hostname.includes('cisa')) return response({ vulnerabilities: [] });
    return new Response('<rss><channel></channel></rss>');
  };
  const result = await runIngestionPipeline({ DB: fixture.db, ENABLE_HN_SOURCE: 'false', RSS_FEEDS: 'https://example.com/rss' }, fetchFn, { mode: 'cron' });
  expect(calls).toBe(5);
  expect(historicalCalls).toBe(0);
  expect(result.sourceStats.nvd.errors).toBe(0);
  expect(fixture.state.has(`backfill:turn:nvd:${backfill.from}:${backfill.to}`)).toBe(false);
  expect(JSON.parse(fixture.state.get('backfill:active')!.value).enabled).toBe(true);
});

test('a concurrent genuine HTTP failure still sets outage backoff after another query hits local quota', async () => {
  const fixture = createTestDb();
  await writeState(fixture.db, 'quota:nvd', Array(4).fill(Date.now()));
  let release: (response: Response) => void = () => {};
  const upstream = new Promise<Response>((resolve) => { release = resolve; });
  const pending = runIngestionPipeline({ DB: fixture.db }, async () => upstream, { mode: 'cron', backfill: range('nvd') });
  await vi.advanceTimersByTimeAsync(0);
  release(new Response('', { status: 503 }));
  const result = await pending;
  expect(result.warnings.some((warning) => warning.includes(localQuota))).toBe(true);
  expect(result.errors.some((error) => error.includes('Source HTTP 503'))).toBe(true);
  const health = JSON.parse(fixture.state.get('health:nvd')!.value);
  expect(health.failureStreak).toBe(1);
  expect(Date.parse(health.cooldownUntil) - Date.now()).toBe(300000);
});

test('the total request budget stops collection without recording an upstream failure', async () => {
  const fixture = createTestDb();
  let calls = 0;
  const env = { DB: fixture.db, RSS_FEEDS: Array.from({ length: 24 }, (_, i) => `https://example.com/feed-${i}`).join(',') };
  const result = await runIngestionPipeline(env, async () => { calls++; return new Response('<rss><channel></channel></rss>'); },
    { mode: 'cron', backfill: range('rss') });
  expect(calls).toBe(20);
  expect(result.errors).toEqual([]);
  expect(result.warnings.some((warning) => warning.includes(SOURCE_BUDGET_MESSAGE))).toBe(true);
  expect(result.sourceStats.rss.errors).toBe(0);
  expect(JSON.parse(fixture.state.get('health:rss')!.value)).toMatchObject({ failureStreak: 0, incomplete: true });
});

test('API-key NVD scans can use their higher quota without the public five-request pause', async () => {
  const fixture = createTestDb();
  let calls = 0;
  const result = await runIngestionPipeline({ DB: fixture.db, NVD_API_KEY: 'test-nvd-key' }, paginatedNvd(() => { calls++; }),
    { mode: 'cron', backfill: range('nvd') });
  expect(calls).toBe(8);
  expect(result.errors).toEqual([]);
  expect(result.warnings).toEqual([]);
});

test('the rejected-token warning survives a local budget pause during GHSA public fallback', async () => {
  const pause = new SourceBudgetError('all', SOURCE_BUDGET_MESSAGE);
  await expect(fetchSourcePage('ghsa', { env: { GITHUB_API_TOKEN: 'bad-test-token' }, timeout: 1000, query: 'default',
    position: { start: range('ghsa').from, end: range('ghsa').to, offset: 0 }, fetchFn: async (_input, init) => {
      if (new Headers(init?.headers).has('Authorization')) return new Response('', { status: 401 });
      throw pause;
    } })).rejects.toMatchObject({ warnings: ['GitHub token rejected (401); using public advisory access. Rotate the source token.'] });
});
