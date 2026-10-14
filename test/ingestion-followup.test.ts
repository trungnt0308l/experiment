import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { runIngestionPipeline, type SourceEvent } from '../src/ingestion';
import { stageEvent, writeState } from '../src/ingestion-storage';
import { ingestionHealth } from '../src/ingestion-runtime';
import { fetchSourcePage } from '../src/ingestion-sources';
import { sendIngestionAlerts } from '../src/ingestion-alerts';
import { createTestDb } from './helpers/db';

const recent = () => new Date(Date.now() - 3600000).toISOString();
const event = (id: string): SourceEvent => ({ source: 'ghsa', externalId: id,
  title: 'LLM arbitrary code execution vulnerability', summary: 'LLM security vulnerability allows arbitrary code execution.',
  url: `https://github.com/advisories/${id}`, publishedAt: recent(), sourceSeverity: 'high' });
const advisory = (id: string) => ({ ghsa_id: id, summary: event(id).title, description: event(id).summary,
  html_url: event(id).url, published_at: recent(), severity: 'high' });
const response = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { headers });
const range = (source: SourceEvent['source']) => ({ from: '2026-02-01T00:00:00.000Z', to: '2026-02-28T12:00:00.000Z', sources: [source] });

beforeEach(() => { vi.spyOn(console, 'log').mockImplementation(() => {}); vi.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

test('oversized NVD metadata does not block later pages or checkpoint advancement', async () => {
  const fixture = createTestDb();
  const offsets: number[] = [];
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get('keywordSearch') !== 'llm') return response({ vulnerabilities: [], totalResults: 0 });
    const offset = Number(url.searchParams.get('startIndex'));
    offsets.push(offset);
    return response({ totalResults: 2, vulnerabilities: [{ cve: { id: `CVE-2026-${10001 + offset}`,
      published: recent(), descriptions: [{ lang: 'en', value: event('test').summary }],
      metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] }, references: [{ url: 'x'.repeat(70000) }] } }] });
  };
  const result = await runIngestionPipeline({ DB: fixture.db }, fetchFn, { backfill: range('nvd') });
  expect(offsets).toEqual([0, 1]);
  expect(result.errors).toEqual([]);
  expect(fixture.events).toHaveLength(2);
  expect(JSON.parse(fixture.state.get(`backfill:${range('nvd').from}:${range('nvd').to}:nvd:llm`)!.value).complete).toBe(true);
  for (const row of fixture.sqlite.prepare('SELECT payload_json FROM ingestion_items').all()) {
    expect(new TextEncoder().encode(String(row.payload_json)).length).toBeLessThanOrEqual(64000);
    expect(JSON.parse(String(row.payload_json)).metadata.truncated).toBe(true);
  }
});

test('quarantines oversized UTF-8 content and resumes it when corrected upstream', async () => {
  const fixture = createTestDb();
  expect(await stageEvent(fixture.db, { ...event('large'), summary: 'LLM vulnerability ' + '🔒'.repeat(20000) }, false)).toBe('quarantined');
  const row = fixture.sqlite.prepare('SELECT status,reason,payload_json FROM ingestion_items').get()!;
  expect(row).toMatchObject({ status: 'review', reason: 'oversized_event' });
  expect(new TextEncoder().encode(String(row.payload_json)).length).toBeLessThanOrEqual(64000);
  expect((await ingestionHealth({ DB: fixture.db })).errors).toContain('1 oversized ingestion records require review');
  await stageEvent(fixture.db, event('large'), false);
  await runIngestionPipeline({ DB: fixture.db }, async () => response([]), { backfill: range('ghsa') });
  expect(fixture.events).toHaveLength(1);
  expect(fixture.sqlite.prepare('SELECT status,reason FROM ingestion_items').get()).toMatchObject({ status: 'done', reason: 'published' });
});

test('detects upstream changes even when discarded oversized metadata differs', async () => {
  const fixture = createTestDb();
  await stageEvent(fixture.db, { ...event('large'), metadata: { references: 'a'.repeat(70000) } }, false);
  const before = fixture.sqlite.prepare('SELECT payload_hash,payload_json FROM ingestion_items').get()!;
  await stageEvent(fixture.db, { ...event('large'), metadata: { references: 'b'.repeat(70000) } }, false);
  const after = fixture.sqlite.prepare('SELECT payload_hash,payload_json FROM ingestion_items').get()!;
  expect(before.payload_json).toBe(after.payload_json);
  expect(before.payload_hash).not.toBe(after.payload_hash);
});

test('honors the GHSA cap and resumes existing 100-item pages without losing the remainder', async () => {
  const fixture = createTestDb();
  const first = Array.from({ length: 100 }, (_, i) => advisory(`GHSA-${i}`));
  const next = 'https://api.github.com/advisories?per_page=100&page=2';
  const calls: string[] = [];
  const fetchFn: typeof fetch = async (input) => {
    calls.push(String(input));
    return String(input) === next ? response(Array.from({ length: 7 }, (_, i) => advisory(`GHSA-next-${i}`)))
      : response(first, { link: `<${next}>; rel="next"` });
  };
  const env = { DB: fixture.db, INGEST_GHSA_MAX_ITEMS_PER_RUN: '40' };
  for (const expected of [40, 40, 27]) {
    const result = await runIngestionPipeline(env, fetchFn, { mode: 'cron', backfill: range('ghsa') });
    expect(result.sourceStats.ghsa.fetched).toBe(expected);
    expect(result.errors).toEqual([]);
  }
  expect(new URL(calls[0]).searchParams.get('per_page')).toBe('40');
  expect(fixture.events).toHaveLength(107);
  expect(calls.filter((url) => url === next)).toHaveLength(1);
});

test('shares the GHSA item budget between normal scanning and historical recovery', async () => {
  const fixture = createTestDb();
  await writeState(fixture.db, 'backfill:active', { ...range('ghsa'), enabled: true });
  let historicalCalls = 0;
  const fetchFn: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.github.com') {
      if (url.searchParams.get('published')?.startsWith('2026-02-01')) historicalCalls++;
      return response(Array.from({ length: 40 }, (_, i) => advisory(`GHSA-${i}`)));
    }
    if (url.hostname.includes('services.nvd')) return response({ vulnerabilities: [], totalResults: 0 });
    if (url.hostname.includes('enisa')) return response([]);
    if (url.hostname.includes('cisa')) return response({ vulnerabilities: [] });
    return new Response('<rss><channel></channel></rss>');
  };
  const result = await runIngestionPipeline({ DB: fixture.db, ENABLE_HN_SOURCE: 'false', RSS_FEEDS: 'https://example.com/rss' }, fetchFn, { mode: 'cron' });
  expect(result.sourceStats.ghsa.fetched).toBe(40);
  expect(historicalCalls).toBe(0);
});

test('backs off HTTP 503 across runs and resets the failure streak after recovery', async () => {
  vi.useFakeTimers();
  const fixture = createTestDb();
  let calls = 0;
  const fetchFn: typeof fetch = async () => { calls++; return new Response('', { status: 503 }); };
  const env = { DB: fixture.db };
  const options = { backfill: range('nvd') };
  await runIngestionPipeline(env, fetchFn, options);
  const firstCalls = calls;
  expect(firstCalls).toBeLessThanOrEqual(2);
  const initial = JSON.parse(fixture.state.get('health:nvd')!.value);
  expect(initial.failureStreak).toBe(1);
  expect(Date.parse(initial.cooldownUntil) - Date.now()).toBe(300000);
  await runIngestionPipeline(env, fetchFn, options);
  expect(calls).toBe(firstCalls);
  vi.advanceTimersByTime(300000);
  await runIngestionPipeline(env, fetchFn, options);
  expect(JSON.parse(fixture.state.get('health:nvd')!.value).failureStreak).toBe(2);
  vi.advanceTimersByTime(600000);
  await runIngestionPipeline(env, async () => response({ vulnerabilities: [], totalResults: 0 }), options);
  const healthy = JSON.parse(fixture.state.get('health:nvd')!.value);
  expect(healthy.failureStreak).toBe(0);
  expect(healthy.cooldownUntil).toBeUndefined();
});

test('preserves the rejected-token warning when public GHSA fallback is rate limited', async () => {
  const fixture = createTestDb();
  const result = await runIngestionPipeline({ DB: fixture.db, GITHUB_API_TOKEN: 'bad-test-token' },
    async (_input, init) => new Response('', { status: new Headers(init?.headers).has('Authorization') ? 401 : 403,
      headers: { 'Retry-After': '3600' } }), { backfill: range('ghsa') });
  expect(result.warnings.some((warning) => warning.includes('Rotate the source token'))).toBe(true);
  expect(result.errors).toContain('ghsa: Source HTTP 403');
  expect(JSON.parse(fixture.state.get('health:ghsa')!.value).warnings).toEqual(result.warnings);
});

test('alert suppression survives keyword changes, issue subsets, and flapping; new problems alert immediately', async () => {
  vi.useFakeTimers();
  const fixture = createTestDb();
  const env = { DB: fixture.db, INGESTION_ALERTS_ENABLED: 'true', TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: '123' };
  await writeState(fixture.db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
  let calls = 0;
  const fetchFn: typeof fetch = async () => { calls++; return new Response(''); };
  const setIssues = async (errors: string[]) => writeState(fixture.db, 'health:nvd', { errors, warnings: [] });
  await setIssues(['NVD keyword "llm": Source HTTP 503', 'ghsa: Source HTTP 403']);
  await sendIngestionAlerts(env, fetchFn);
  await setIssues(['NVD keyword "prompt injection": Source HTTP 503']);
  await sendIngestionAlerts(env, fetchFn);
  await setIssues(['NVD keyword "machine learning": Source HTTP 503', 'ghsa: Source HTTP 403']);
  await sendIngestionAlerts(env, fetchFn);
  expect(calls).toBe(1);
  await setIssues(['NVD keyword "llm": Source HTTP 503', 'euvd: Source HTTP 500']);
  await sendIngestionAlerts(env, fetchFn);
  expect(calls).toBe(2);
  vi.advanceTimersByTime(6 * 3600000);
  await writeState(fixture.db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
  await sendIngestionAlerts(env, fetchFn);
  expect(calls).toBe(3);
});

test('GHSA page size clamps unsafe limits through the shared runtime cap configuration', async () => {
  for (const [limit, expected] of [['invalid', 40], ['0', 5], ['120', 100]] as const) {
    let size = 0;
    await fetchSourcePage('ghsa', { env: { INGEST_GHSA_MAX_ITEMS_PER_RUN: limit }, timeout: 1000, query: 'default',
      position: { start: recent(), end: recent(), offset: 0 },
      fetchFn: async (input) => { size = Number(new URL(String(input)).searchParams.get('per_page')); return response([]); } });
    expect(size).toBe(expected);
  }
});
