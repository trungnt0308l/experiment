import { describe, expect, test } from 'vitest';
import { isLikelyAiSecurityIncident, runIngestionPipeline } from '../src/ingestion';
import { acquireLease, releaseLease, stageEvent } from '../src/ingestion-storage';
import { fetchSourcePage } from '../src/ingestion-sources';
import { sourceRequest } from '../src/ingestion-network';
import { createTestDb } from './helpers/db';

const recent = () => new Date(Date.now() - 3600000).toISOString();
const event = (id = 'GHSA-reliable') => ({ source: 'ghsa' as const, externalId: id,
  title: 'LLM critical remote code execution vulnerability', summary: 'An LLM vulnerability allows arbitrary code execution.',
  url: `https://github.com/advisories/${id}`, publishedAt: recent(), sourceSeverity: 'high' as const });
const response = (body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { headers });
const emptyFetch: typeof fetch = async (input) => String(input).includes('services.nvd.nist.gov')
  ? response({ vulnerabilities: [], totalResults: 0 }) : String(input).includes('known_exploited')
    ? response({ vulnerabilities: [] }) : String(input).includes('api.github.com') || String(input).includes('enisa')
      ? response([]) : new Response('<rss><channel></channel></rss>');
const envFor = (db: D1Database) => ({ DB: db, ENABLE_HN_SOURCE: 'false', RSS_FEEDS: 'https://example.com/rss' });

function failOnce(db: D1Database, needle: string): D1Database {
  let failed = false;
  return { ...db, prepare(sql: string) {
    const statement = db.prepare(sql);
    if (!sql.includes(needle)) return statement;
    return { ...statement, bind(...params: unknown[]) {
      const bound = statement.bind(...params);
      return { ...bound, async run() {
        if (!failed) { failed = true; throw new Error('Temporary database failure'); }
        return bound.run();
      } };
    } };
  } } as D1Database;
}

describe('durable recovery', () => {
  test('retries a failed event write even after the source page disappears', async () => {
    const fixture = createTestDb();
    await stageEvent(fixture.db, event(), false);
    const first = await runIngestionPipeline(envFor(failOnce(fixture.db, 'INSERT INTO ingested_events')), emptyFetch);
    expect(first.errors).toContain('Temporary database failure');
    expect(fixture.events).toHaveLength(0);
    fixture.sqlite.exec('UPDATE ingestion_items SET retry_after=NULL');
    const retry = await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    expect(retry.draftsCreated).toBe(1);
    expect(fixture.events).toHaveLength(1);
  });

  test('repairs publication after a failed draft write without inserting a duplicate event', async () => {
    const fixture = createTestDb();
    await stageEvent(fixture.db, event(), false);
    await runIngestionPipeline(envFor(failOnce(fixture.db, 'INSERT INTO draft_posts')), emptyFetch);
    expect(fixture.events).toHaveLength(1);
    fixture.sqlite.exec('UPDATE ingestion_items SET retry_after=NULL');
    const retry = await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    expect(retry.draftsCreated).toBe(1);
    expect(fixture.events).toHaveLength(1);
    await stageEvent(fixture.db, event(), false);
    await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM draft_posts').get()?.count).toBe(1);
  });

  test('processes both records sharing a timestamp across budgeted runs', async () => {
    const fixture = createTestDb();
    const date = recent();
    await stageEvent(fixture.db, { ...event('first'), publishedAt: date }, false);
    await stageEvent(fixture.db, { ...event('second'), publishedAt: date }, false);
    const env = { ...envFor(fixture.db), INGEST_CRON_MAX_PROCESS_EVENTS: '1' };
    expect((await runIngestionPipeline(env, emptyFetch, { mode: 'cron' })).queuedForNextRun).toBe(1);
    await runIngestionPipeline(env, emptyFetch, { mode: 'cron' });
    expect(fixture.events).toHaveLength(2);
  });

  test('a former lease owner cannot release a newer run lease', async () => {
    const fixture = createTestDb();
    expect(await acquireLease(fixture.db, 'current-owner', new Date().toISOString())).toBe(true);
    await releaseLease(fixture.db, 'old-owner');
    expect(await acquireLease(fixture.db, 'new-owner', new Date().toISOString())).toBe(false);
  });

  test('manual and cron triggers share the lease and a lock database failure is fail-closed', async () => {
    const fixture = createTestDb();
    await acquireLease(fixture.db, 'cron-owner', new Date().toISOString());
    expect((await runIngestionPipeline(envFor(fixture.db), emptyFetch)).lockSkipped).toBe(true);
    const broken = failOnce(fixture.db, 'INSERT INTO ingestion_state');
    expect((await runIngestionPipeline(envFor(broken), emptyFetch)).status).toBe('failed');
  });
});

describe('source completeness and metadata', () => {
  test('does not classify a non-AI product from AI-assisted discovery or acknowledgement credits', () => {
    expect(isLikelyAiSecurityIncident('Pelican Web UI privilege escalation',
      'On April 2, a Claude coding agent alerted the team to a privilege escalation vulnerability in the Web UI.', 'ghsa')).toBe(false);
    expect(isLikelyAiSecurityIncident('Argo authorization denial of service',
      'A nil pointer causes a denial of service.\n## Acknowledgements\nIdentified using Claude and ChatGPT.', 'ghsa')).toBe(false);
    expect(isLikelyAiSecurityIncident('Ollama vulnerability', 'An issue was discovered by a Claude coding agent.', 'ghsa')).toBe(true);
  });
  test('follows NVD pages and processes a newer incident beyond the first page', async () => {
    const fixture = createTestDb();
    const calls: number[] = [];
    const fetchFn: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (!url.hostname.includes('services.nvd')) return emptyFetch(input);
      if (url.searchParams.get('keywordSearch') !== 'llm') return response({ vulnerabilities: [], totalResults: 0 });
      const offset = Number(url.searchParams.get('startIndex'));
      calls.push(offset);
      return response({ totalResults: 2, vulnerabilities: [{ cve: {
        id: `CVE-2026-${offset + 10001}`, published: recent(),
        descriptions: [{ lang: 'en', value: 'LLM vulnerability' }],
        metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8 } }] },
      } }] });
    };
    const result = await runIngestionPipeline(envFor(fixture.db), fetchFn);
    expect(calls).toEqual([0, 1]);
    expect(result.draftsCreated).toBe(2);
    expect(fixture.events.every((item) => item.severity === 'high')).toBe(true);
  });

  test('falls back once to public GHSA access after token rejection and retains the warning', async () => {
    let calls = 0;
    const fetchFn: typeof fetch = async (_input, init) => {
      calls += 1;
      if (new Headers(init?.headers).has('Authorization')) return new Response('', { status: 401 });
      return response([{ ghsa_id: 'GHSA-safe', summary: 'LLM vulnerability', description: 'full details',
        html_url: 'https://github.com/advisories/GHSA-safe', published_at: recent(), severity: 'high' }]);
    };
    const page = await fetchSourcePage('ghsa', { env: { GITHUB_API_TOKEN: 'rejected-test-token' }, fetchFn,
      timeout: 1000, query: 'default', position: { start: recent(), end: new Date().toISOString(), offset: 0 } });
    expect(calls).toBe(2);
    expect(page.events).toHaveLength(1);
    expect(page.warnings[0]).toContain('token rejected');
  });

  test('uses GitHub accepted calendar-date ranges and explicitly restricts to reviewed advisories', async () => {
    let url: URL | undefined;
    await fetchSourcePage('ghsa', { env: {}, fetchFn: async (input) => { url = new URL(String(input)); return response([]); },
      timeout: 1000, query: 'default', position: { start: '2026-05-01T00:00:00.000Z', end: '2026-08-29T00:00:00.000Z', offset: 0 } });
    expect(url!.searchParams.get('published')).toBe('2026-05-01..2026-08-29');
    expect(url!.searchParams.get('type')).toBe('reviewed');
  });

  test('honors rate-limit cooldown without making source requests on the next run', async () => {
    const fixture = createTestDb();
    let calls = 0;
    const fetchFn: typeof fetch = async (input) => {
      if (!String(input).includes('services.nvd')) return emptyFetch(input);
      calls += 1;
      return new Response('', { status: 429, headers: { 'Retry-After': '3600' } });
    };
    await runIngestionPipeline(envFor(fixture.db), fetchFn);
    const firstCalls = calls;
    await runIngestionPipeline(envFor(fixture.db), fetchFn);
    expect(calls).toBe(firstCalls);
  });

  test('maps real EUVD datePublished and baseScore fields', async () => {
    const page = await fetchSourcePage('euvd', { env: {}, fetchFn: async () => response([{
      id: 'EUVD-2026-10001', description: 'LLM security vulnerability', datePublished: 'Feb 20, 2026, 1:00:00 PM',
      baseScore: 8.9, aliases: 'CVE-2026-10001',
    }]), timeout: 1000, query: 'default', position: { start: recent(), end: recent(), offset: 0 } });
    expect(page.events[0].publishedAt).toBe('2026-02-20T13:00:00.000Z');
    expect(page.events[0].sourceSeverity).toBe('high');
    expect(page.events[0].cveId).toBe('CVE-2026-10001');
  });

  test('updates an advisory with a changed title using its stable source identifier', async () => {
    const fixture = createTestDb();
    await stageEvent(fixture.db, event(), false);
    await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    await stageEvent(fixture.db, { ...event(), title: 'LLM revised critical advisory' }, false);
    await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.sqlite.prepare('SELECT title FROM ingested_events').get()?.title).toContain('revised');
  });

  test('retains a durable item if the checkpoint write fails and recovers on a later run', async () => {
    const fixture = createTestDb();
    let failed = false;
    const db = { ...fixture.db, prepare(sql: string) {
      const statement = fixture.db.prepare(sql);
      if (!sql.startsWith('INSERT INTO ingestion_state')) return statement;
      return { ...statement, bind(...params: unknown[]) {
        const bound = statement.bind(...params);
        return { ...bound, async run() {
          if (!failed && String(params[0]).startsWith('scan:ghsa:')) { failed = true; throw new Error('Checkpoint unavailable'); }
          return bound.run();
        } };
      } };
    } } as D1Database;
    const fetchFn: typeof fetch = async (input) => String(input).includes('api.github.com')
      ? response([{ ghsa_id: 'GHSA-checkpoint', summary: event().title, description: event().summary,
        html_url: event().url, published_at: recent(), severity: 'high' }]) : emptyFetch(input);
    const first = await runIngestionPipeline(envFor(db), fetchFn);
    expect(first.errors.some((message) => message.includes('Checkpoint unavailable'))).toBe(true);
    expect(fixture.state.has('scan:ghsa:default')).toBe(false);
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM ingestion_items').get()?.count).toBe(1);
    await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM draft_posts').get()?.count).toBe(1);
  });

  test('a changed payload does not auto-publish or overwrite an existing editorial draft', async () => {
    const fixture = createTestDb();
    await stageEvent(fixture.db, event(), false);
    await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    fixture.sqlite.exec("UPDATE draft_posts SET status='draft',headline='Reviewed title'");
    await stageEvent(fixture.db, { ...event(), title: 'LLM changed high vulnerability' }, false);
    await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    expect(fixture.sqlite.prepare('SELECT status,headline FROM draft_posts').get()).toMatchObject({ status: 'draft', headline: 'Reviewed title' });
    expect(fixture.sqlite.prepare('SELECT reason FROM ingestion_items').get()?.reason).toBe('existing_editorial_draft');
  });

  test('updated NVD scans use modification dates instead of permanently missing old advisory changes', async () => {
    let query = '';
    await fetchSourcePage('nvd', { env: {}, fetchFn: async (input) => { query = String(input); return response({ totalResults: 0, vulnerabilities: [] }); },
      timeout: 1000, query: 'llm', position: { start: recent(), end: recent(), offset: 0, dateField: 'updated' } });
    expect(query).toContain('lastModStartDate=');
    expect(query).not.toContain('pubStartDate=');
  });

  test('canonical CVE identity links the same advisory from different providers', async () => {
    const fixture = createTestDb();
    await stageEvent(fixture.db, { ...event('CVE-2026-123456'), source: 'nvd' }, false);
    await stageEvent(fixture.db, { ...event(), cveId: 'CVE-2026-123456' }, false);
    await runIngestionPipeline(envFor(fixture.db), emptyFetch);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.sqlite.prepare('SELECT canonical_id FROM ingested_events').get()?.canonical_id).toBe('CVE-2026-123456');
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM draft_posts').get()?.count).toBe(1);
  });

  test('scheduled runs resume an approved historical backfill and finish without republishing duplicates', async () => {
    const fixture = createTestDb();
    const range = { from: '2025-10-01T00:00:00Z', to: '2026-02-01T00:00:00Z', sources: ['ghsa'], enabled: true };
    fixture.sqlite.prepare('INSERT INTO ingestion_state(key,value,updated_at) VALUES (?,?,?)')
      .run('backfill:active', JSON.stringify(range), recent());
    const fetchFn: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.hostname !== 'api.github.com' || !url.searchParams.get('published')?.includes('2025-10-01')) return emptyFetch(input);
      return response([{ ghsa_id: 'GHSA-historical', summary: event().title, description: event().summary,
        html_url: event().url, published_at: '2025-11-01T00:00:00Z', severity: 'high' }]);
    };
    await runIngestionPipeline(envFor(fixture.db), fetchFn, { mode: 'cron' });
    await runIngestionPipeline(envFor(fixture.db), fetchFn, { mode: 'cron' });
    expect(fixture.events).toHaveLength(1);
    expect(fixture.sqlite.prepare('SELECT published_at FROM ingested_events').get()?.published_at).toBe('2025-11-01T00:00:00.000Z');
    expect(fixture.sqlite.prepare('SELECT count(*) AS count FROM draft_posts').get()?.count).toBe(1);
    expect(JSON.parse(fixture.state.get('backfill:active')!.value).enabled).toBe(false);
  });

  test('historical NVD queries rotate independently when normal scans leave only one request per run', async () => {
    const fixture = createTestDb();
    const range = { from: '2026-02-01T00:00:00.000Z', to: '2026-02-02T00:00:00.000Z', sources: ['nvd'], enabled: true };
    fixture.sqlite.prepare('INSERT INTO ingestion_state(key,value,updated_at) VALUES (?,?,?)')
      .run('backfill:active', JSON.stringify(range), recent());
    const seen = new Set<string>();
    const fetchFn: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get('pubStartDate') === range.from) seen.add(url.searchParams.get('keywordSearch')!);
      return emptyFetch(input);
    };
    for (let run = 0; run < 4; run += 1) {
      fixture.sqlite.exec("DELETE FROM ingestion_state WHERE key IN ('quota:nvd','health:nvd')");
      await runIngestionPipeline(envFor(fixture.db), fetchFn, { mode: 'cron' });
    }
    expect([...seen].sort()).toEqual(['artificial intelligence', 'llm', 'machine learning', 'prompt injection']);
    expect(JSON.parse(fixture.state.get('backfill:active')!.value).enabled).toBe(false);
  });
});

test('response deadlines include a stalled body after headers arrive', async () => {
  const fetchFn: typeof fetch = async () => new Response(new ReadableStream({ start() {} }));
  await expect(sourceRequest(fetchFn, 'https://example.com/stalled', 5)).rejects.toThrow('deadline');
});
