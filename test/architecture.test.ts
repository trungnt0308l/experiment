import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { runIngestionPipeline } from '../src/ingestion';
import { ingestionHealth } from '../src/ingestion-runtime';
import { sendIngestionAlerts } from '../src/ingestion-alerts';
import { alertIdentity, actionableSourceErrors } from '../src/ingestion-policy';
import { fetchSourcePage } from '../src/ingestion-sources';
import { enrichPendingDrafts, runScheduledEnrichment } from '../src/ingestion-enrichment';
import { acquireLease, writeState } from '../src/ingestion-storage';
import { createTestDb, seedIncidentRows } from './helpers/db';
import worker from '../src/index';

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const response = (value: unknown) => new Response(JSON.stringify(value));
const emptyFetch: typeof fetch = async (input) => {
  const url = String(input);
  return url.includes('services.nvd') ? response({ vulnerabilities: [], totalResults: 0 })
    : url.includes('known_exploited') ? response({ vulnerabilities: [] })
      : url.includes('github.com') || url.includes('enisa') ? response([]) : new Response('<rss><channel></channel></rss>');
};
const alertEnv = (DB: D1Database) => ({ DB, ENABLE_HN_SOURCE: 'false', INGESTION_ALERTS_ENABLED: 'true',
  TELEGRAM_BOT_TOKEN: 'test-only', TELEGRAM_CHAT_ID: '123' });

describe('actionable operational health', () => {
  test('optional enrichment and quota notes remain visible without becoming outage alerts', async () => {
    const { db } = createTestDb();
    await writeState(db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
    await writeState(db, 'run:latest:any', { errors: [], warnings: ['Optional enrichment deferred; published incidents retain deterministic content.'] });
    const health = await ingestionHealth(alertEnv(db));
    expect(health.status).toBe('healthy');
    expect(health.warnings).toHaveLength(1);
    const deliver = vi.fn(emptyFetch);
    await sendIngestionAlerts(alertEnv(db), deliver);
    expect(deliver).not.toHaveBeenCalled();
  });

  test('transient errors stay visible while sustained failures and configuration errors alert', async () => {
    const { db } = createTestDb();
    await writeState(db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
    const error = 'ghsa: Response deadline exceeded';
    const health = { errors: [error], warnings: [], failureStreak: 1, firstFailureAt: new Date().toISOString() };
    await writeState(db, 'health:ghsa', health);
    await writeState(db, 'run:latest:any', { errors: [error], warnings: [] });
    const deliver = vi.fn(emptyFetch);
    await sendIngestionAlerts(alertEnv(db), deliver);
    expect(deliver).not.toHaveBeenCalled();
    expect((await ingestionHealth(alertEnv(db))).errors).toContain(error);
    await writeState(db, 'health:ghsa', { ...health, failureStreak: 3 });
    await sendIngestionAlerts(alertEnv(db), deliver);
    expect(deliver).toHaveBeenCalledOnce();
    expect(actionableSourceErrors({ ...health, errors: ['ghsa: Source HTTP 403'] })).toEqual(['ghsa: Source HTTP 403']);
  });

  test('stale source success alerts even when local budgets hide an old failure', async () => {
    const { db } = createTestDb();
    await writeState(db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
    await writeState(db, 'health:nvd', { errors: [], warnings: ['NVD local request quota reached; scan resumes next run'],
      lastSuccessAt: new Date(Date.now() - 7 * 3600000).toISOString(), failureStreak: 0 });
    expect((await ingestionHealth(alertEnv(db))).alertIssues).toContain('nvd: no successful collection for six hours');
  });

  test('credential warnings survive a successful later source phase', async () => {
    const { db } = createTestDb();
    await writeState(db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
    await writeState(db, 'health:ghsa', { errors: [], warnings: [], failureStreak: 0 });
    await writeState(db, 'run:latest:any', { errors: [], warnings: ['GitHub token rejected (401); using public advisory access. Rotate the source token.'] });
    expect((await ingestionHealth(alertEnv(db))).alertIssues).toHaveLength(1);
  });

  test('normalizes timeout and HTTP 503 to the same source issue and keeps distinct RSS feeds', () => {
    expect(alertIdentity('NVD keyword "llm": Source HTTP 503')).toBe(alertIdentity('NVD keyword "prompt injection": Response deadline exceeded'));
    expect(alertIdentity('rss (https://a.example/feed): Source HTTP 503')).not.toBe(alertIdentity('rss (https://b.example/feed): Source HTTP 503'));
  });

  test('a new issue does not postpone reminders for a continuing outage', async () => {
    vi.useFakeTimers();
    const { db } = createTestDb();
    const deliver = vi.fn(async () => new Response(''));
    const setErrors = async (errors: string[]) => {
      await writeState(db, 'run:latest:cron', { finishedAt: new Date().toISOString() });
      await writeState(db, 'health:ghsa', { errors, warnings: [] });
    };
    await setErrors(['ghsa: Source HTTP 503']);
    await sendIngestionAlerts(alertEnv(db), deliver);
    vi.advanceTimersByTime(5 * 3600000);
    await setErrors(['ghsa: Response deadline exceeded', 'euvd: Source HTTP 403']);
    await sendIngestionAlerts(alertEnv(db), deliver);
    vi.advanceTimersByTime(3600000);
    await setErrors(['ghsa: Source HTTP 503']);
    await sendIngestionAlerts(alertEnv(db), deliver);
    expect(deliver).toHaveBeenCalledTimes(3);
  });
});

describe('source isolation', () => {
  test('RSS timeout has a persistent backoff while another feed continues collecting', async () => {
    vi.useFakeTimers();
    const { db } = createTestDb();
    let broken = 0, healthy = 0;
    const env = { DB: db, RSS_FEEDS: 'https://broken.example/feed,https://healthy.example/feed' };
    const fetchFn: typeof fetch = async (input) => {
      if (String(input).includes('broken.example')) { broken++; throw new Error('Response deadline exceeded'); }
      if (String(input).includes('healthy.example')) { healthy++; return new Response('<rss><channel></channel></rss>'); }
      return emptyFetch(input);
    };
    const options = { mode: 'cron' as const };
    await runIngestionPipeline(env, fetchFn, options);
    await runIngestionPipeline(env, fetchFn, options);
    expect(broken).toBe(1);
    expect(healthy).toBe(2);
    const health = JSON.parse((await db.prepare("SELECT value FROM ingestion_state WHERE key='health:rss'").first<{ value: string }>())!.value);
    expect(health.queries['https://broken.example/feed'].failureStreak).toBe(1);
    expect(health.queries['https://healthy.example/feed'].failureStreak).toBe(0);
  });

  test('outbound source concurrency is bounded while reading response bodies', async () => {
    const { db } = createTestDb();
    let active = 0, peak = 0;
    const fetchFn: typeof fetch = async (input) => {
      active++; peak = Math.max(peak, active);
      const body = await (await emptyFetch(input)).text();
      return new Response(new ReadableStream({ start(controller) {
        setTimeout(() => { controller.enqueue(new TextEncoder().encode(body)); controller.close(); active--; }, 5);
      } }));
    };
    await runIngestionPipeline({ DB: db, ENABLE_HN_SOURCE: 'false', RSS_FEEDS: 'https://example.com/feed' }, fetchFn, { mode: 'cron' });
    expect(peak).toBeLessThanOrEqual(4);
    expect(active).toBe(0);
  });

  test('CISA primary 403 falls back to its official validated mirror', async () => {
    const urls: string[] = [];
    const page = await fetchSourcePage('cisa_kev', { env: {}, query: 'default', timeout: 1000,
      position: { start: '', end: '', offset: 0 }, fetchFn: async input => {
        urls.push(String(input));
        return String(input).includes('www.cisa.gov') ? new Response('', { status: 403 }) : response({ vulnerabilities: [{
          cveID: 'CVE-2026-12345', vendorProject: 'AI', product: 'LLM', shortDescription: 'LLM vulnerability', dateAdded: '2026-02-27',
        }] });
      } });
    expect(urls[1]).toBe('https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json');
    expect(page.events[0].cveId).toBe('CVE-2026-12345');
    expect(page.warnings[0]).toContain('official cisagov mirror');
  });

  test('a source database failure waits for other workers before releasing the shared lease', async () => {
    const { db } = createTestDb();
    const failingDb = { ...db, prepare(sql: string) {
      const statement = db.prepare(sql);
      return { ...statement, bind(...params: unknown[]) {
        const bound = statement.bind(...params);
        if (sql.startsWith('SELECT value FROM ingestion_state') && params[0] === 'health:cisa_kev')
          return { ...bound, async first() { throw new Error('Source health database unavailable'); } };
        return bound;
      } };
    } } as D1Database;
    let active = 0;
    const slowFetch: typeof fetch = async (input) => {
      active++;
      await new Promise(resolve => setTimeout(resolve, 5));
      active--;
      return emptyFetch(input);
    };
    const result = await runIngestionPipeline({ DB: failingDb, ENABLE_HN_SOURCE: 'false' }, slowFetch, { mode: 'cron' });
    expect(result.status).toBe('failed');
    expect(active).toBe(0);
    expect(await db.prepare("SELECT key FROM ingestion_state WHERE key='lock:cron'").first()).toBeNull();
  });
});

describe('independent optional enrichment', () => {
  test('five-minute newsletter cron never invokes collection or enrichment', async () => {
    const DB = seed();
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({ cron: '*/5 * * * *' } as ScheduledController,
      { DB, NEWSLETTER_ENABLED: 'true', RESEND_API_KEY: 'test-only' },
      { waitUntil: promise => { pending.push(promise); } });
    await Promise.all(pending);
    expect(await DB.prepare("SELECT key FROM newsletter_state WHERE key='latest'").first()).toBeTruthy();
    expect(await DB.prepare("SELECT key FROM ingestion_state WHERE key IN ('run:latest:cron','enrichment:latest')").first()).toBeNull();
  });
  const seed = () => seedIncidentRows([1, 2].map(id => ({ draft_id: id, title: `LLM vulnerability ${id}`, slug: `llm-${id}`,
    url: 'https://example.com', event_published_at: '2026-02-27T00:00:00Z', published_at: '2026-02-27T00:00:00Z', created_at: '2026-02-27T00:00:00Z' })));

  test('cron ingestion does not call the optional provider', async () => {
    const DB = seed();
    const fetched: string[] = [];
    await runIngestionPipeline({ DB, OPENAI_API_KEY: 'test-only', ENABLE_HN_SOURCE: 'false' }, async input => {
      fetched.push(String(input)); return emptyFetch(input);
    }, { mode: 'cron' });
    expect(fetched.some(url => url.includes('openai'))).toBe(false);
  });

  test('a failing draft does not starve later drafts after cooldown', async () => {
    vi.useFakeTimers();
    const DB = seed();
    await enrichPendingDrafts({ DB, OPENAI_API_KEY: 'test-only' }, async () => new Response('', { status: 429 }), Date.now() + 30000, 1);
    vi.advanceTimersByTime(3600001);
    const succeed: typeof fetch = async () => response({ output_text: JSON.stringify({ summary: 'LLM issue confirmed.',
      impact: 'An affected service may expose data.', remedy: ['Upgrade.', 'Limit access.', 'Check logs.'] }) });
    await enrichPendingDrafts({ DB, OPENAI_API_KEY: 'test-only' }, succeed, Date.now() + 30000, 1);
    const rows = await DB.prepare('SELECT id,enriched_at FROM draft_posts ORDER BY id').all();
    expect(rows.results[0].enriched_at).toBeNull();
    expect(rows.results[1].enriched_at).toBeTruthy();
  });

  test('enrichment respects ingestion ownership and never overwrites the cron heartbeat', async () => {
    const DB = seed();
    await writeState(DB, 'run:latest:cron', { runId: 'ingestion', finishedAt: new Date().toISOString() });
    await acquireLease(DB, 'another-run', new Date().toISOString());
    const provider = vi.fn(emptyFetch);
    await runScheduledEnrichment({ DB, OPENAI_API_KEY: 'test-only' }, provider);
    expect(provider).not.toHaveBeenCalled();
    expect((await ingestionHealth({ DB })).latest?.runId).toBe('ingestion');
  });

  test('the separate cron invokes enrichment without starting collection or sending alerts', async () => {
    const DB = seed();
    const pending: Promise<unknown>[] = [];
    await worker.scheduled({ cron: '15 * * * *' } as ScheduledController, { DB },
      { waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } });
    await Promise.all(pending);
    const result = await DB.prepare("SELECT key FROM ingestion_state WHERE key='enrichment:latest'").first();
    expect(result).toBeTruthy();
    expect(await DB.prepare("SELECT key FROM ingestion_state WHERE key='run:latest:cron'").first()).toBeNull();
  });
});
