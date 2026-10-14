import type { EnvBindings } from './app';
import { buildDraftPost, isEventRecent, isLikelyAiSecurityIncident, resolveRuntimeCaps, shouldAutoPublish,
  storeDraft, storeEvent, toStoredEvent, type IngestionRunOptions, type IngestionRunResult, type SourceEvent } from './ingestion';
import { fetchSourcePage, sourceQueries, SOURCES, type ScanPosition } from './ingestion-sources';
import { acquireLease, finishItem, pendingCount, pendingItems, readState, releaseLease, retryItem, stageEvent, writeState, type InboxItem } from './ingestion-storage';
import { SourceHttpError } from './ingestion-network';
import { enrichPendingDrafts } from './ingestion-enrichment';

type Backfill = NonNullable<IngestionRunOptions['backfill']>;
type SourceHealth = { status: string; lastAttemptAt: string; lastSuccessAt?: string; errors: string[];
  warnings: string[]; cooldownUntil?: string; failureStreak?: number; incomplete: boolean };
type Run = { env: EnvBindings & { DB: D1Database }; fetchFn: typeof fetch; options: IngestionRunOptions;
  result: IngestionRunResult; deadline: number; writes: number; requests: number; startedAt: string; processing?: Promise<void> };
const WINDOW_MS = 120 * 86400000;
const OVERLAP_MS = 2 * 86400000;

function emptyResult(mode: 'cron' | 'manual'): IngestionRunResult {
  return { mode, status: 'healthy', lockSkipped: false, stopReason: 'completed', fetched: 0, relevant: 0,
    processed: 0, inserted: 0, deduped: 0, queuedForNextRun: 0, draftsCreated: 0, llmDedupeCalls: 0,
    llmEnrichCalls: 0, warnings: [], errors: [], sourceStats: Object.fromEntries(SOURCES.map((source) => [source,
      { fetched: 0, eligible: 0, processed: 0, inserted: 0, deduped: 0, queued: 0, errors: 0, rejected: 0 }])) as IngestionRunResult['sourceStats'] };
}

function reserve(run: Run, writes: number): boolean {
  const caps = resolveRuntimeCaps(run.env, run.result.mode);
  if (Date.now() >= run.deadline) run.result.stopReason = 'runtime_budget';
  else if (run.writes + writes > caps.maxDbWrites) run.result.stopReason = 'db_budget';
  else { run.writes += writes; return true; }
  return false;
}

function initialPosition(run: Run): ScanPosition {
  const backfill = run.options.backfill;
  const now = Date.parse(run.startedAt);
  const start = backfill ? Date.parse(backfill.from) : now - 60 * 86400000;
  const end = backfill ? Math.min(Date.parse(backfill.to), start + WINDOW_MS) : now;
  return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), offset: 0 };
}

function advanceWindow(position: ScanPosition, run: Run): ScanPosition {
  const end = Date.parse(position.end);
  if (run.options.backfill) return end >= Date.parse(run.options.backfill.to)
    ? { ...position, complete: true } : { start: position.end, end: new Date(Math.min(end + WINDOW_MS, Date.parse(run.options.backfill.to))).toISOString(), offset: 0 };
  return { start: new Date(end - OVERLAP_MS).toISOString(), end: new Date().toISOString(), offset: 0, dateField: 'updated' };
}

async function savePage(run: Run, source: SourceEvent['source'], events: SourceEvent[]): Promise<boolean> {
  const stats = run.result.sourceStats[source];
  stats.fetched += events.length;
  run.result.fetched += events.length;
  for (const event of events) {
    if (!isLikelyAiSecurityIncident(event.title, event.summary, source)) { stats.rejected += 1; continue; }
    stats.eligible += 1;
    if (!reserve(run, 1)) return false;
    const retained = await stageEvent(run.env.DB, event, Boolean(run.options.backfill));
    if (retained !== 'staged') run.result.warnings.push(`${source}: ${event.externalId} ${retained === 'quarantined' ? 'quarantined for oversized content' : 'oversized metadata truncated'}`);
  }
  const dated = events.map((event) => event.publishedAt).filter((date): date is string => Boolean(date)).sort();
  if (dated.length) await writeState(run.env.DB, `cursor:${source}`, { publishedAt: dated.at(-1) });
  return true;
}

async function scanQuery(run: Run, source: SourceEvent['source'], query: string, health: SourceHealth): Promise<boolean> {
  const prefix = run.options.backfill ? `backfill:${run.options.backfill.from}:${run.options.backfill.to}` : 'scan';
  const key = `${prefix}:${source}:${query}`;
  let position = await readState<ScanPosition>(run.env.DB, key) ?? initialPosition(run);
  if (position.complete) return false;
  const caps = resolveRuntimeCaps(run.env, run.result.mode);
  const pages = run.result.mode === 'cron' ? 2 : 5;
  for (let pageIndex = 0; pageIndex < pages && Date.now() < run.deadline; pageIndex += 1) {
    if (health.cooldownUntil) return true;
    const remaining = caps.ghsaMaxItemsPerRun - run.result.sourceStats.ghsa.fetched;
    if (source === 'ghsa' && remaining <= 0) return true;
    const page = await fetchSourcePage(source, { env: run.env, fetchFn: run.fetchFn, query, position,
      timeout: Math.max(1, Math.min(caps.fetchTimeoutMs, run.deadline - Date.now())) });
    run.result.warnings.push(...page.warnings);
    health.warnings.push(...page.warnings);
    const events = source === 'ghsa' ? page.events.slice(position.itemOffset ?? 0) : page.events;
    const retained = source === 'ghsa' ? events.slice(0, remaining) : events;
    if (!(await savePage(run, source, retained))) return true;
    if (retained.length < events.length) {
      await writeState(run.env.DB, key, { ...position, itemOffset: (position.itemOffset ?? 0) + retained.length });
      return true;
    }
    const more = page.next !== undefined || page.offset !== undefined;
    position = more ? { ...position, next: page.next, offset: page.offset ?? position.offset, itemOffset: 0 } : advanceWindow(position, run);
    await writeState(run.env.DB, key, position);
    if (!more) return false;
  }
  return true;
}

function recordSourceFailure(run: Run, source: SourceEvent['source'], query: string, health: SourceHealth, error: unknown): void {
  health.incomplete = true;
  const label = source === 'nvd' ? `NVD keyword "${query}"` : source;
  const message = `${label}: ${error instanceof Error ? error.message : 'source failed'}`;
  health.errors.push(message); run.result.errors.push(message); run.result.sourceStats[source].errors += 1;
  if (!(error instanceof SourceHttpError)) return;
  health.warnings.push(...error.warnings); run.result.warnings.push(...error.warnings);
  if (error.status !== 429 && error.status !== 403 && error.status < 500) return;
  if (!health.cooldownUntil) health.failureStreak = (health.failureStreak ?? 0) + 1;
  const backoff = Math.min(6 * 3600000, 300000 * 2 ** Math.min((health.failureStreak ?? 1) - 1, 7));
  const until = Date.now() + Math.max(error.retryAfterMs, backoff);
  health.cooldownUntil = new Date(Math.max(Date.parse(health.cooldownUntil ?? '') || 0, until)).toISOString();
}

async function scanSource(run: Run, source: SourceEvent['source']): Promise<void> {
  const old = await readState<SourceHealth>(run.env.DB, `health:${source}`);
  if (old?.cooldownUntil && Date.parse(old.cooldownUntil) > Date.now()) {
    run.result.warnings.push(`${source}: cooling down until ${old.cooldownUntil}`);
    return;
  }
  const health: SourceHealth = { status: 'healthy', lastAttemptAt: run.startedAt,
    lastSuccessAt: old?.lastSuccessAt, errors: [], warnings: [], incomplete: false, failureStreak: old?.failureStreak ?? 0 };
  const queries = [...sourceQueries(source, run.env)];
  if (source === 'nvd') {
    const turnKey = run.options.backfill ? `backfill:turn:nvd:${run.options.backfill.from}:${run.options.backfill.to}` : 'scan:turn:nvd';
    const turn = await readState<number>(run.env.DB, turnKey) ?? 0;
    queries.push(...queries.splice(0, turn % queries.length));
    await writeState(run.env.DB, turnKey, turn + 1);
  }
  const worker = async () => { while (queries.length) {
    const query = queries.shift()!;
    if (health.cooldownUntil) { health.incomplete = true; break; }
    try { health.incomplete = (await scanQuery(run, source, query, health)) || health.incomplete; }
    catch (error) { recordSourceFailure(run, source, query, health, error); }
  } };
  await Promise.all(Array.from({ length: source === 'nvd' ? 2 : 1 }, () => worker()));
  health.status = health.errors.length || health.warnings.length ? 'degraded' : 'healthy';
  if (!health.errors.length) { health.lastSuccessAt = new Date().toISOString(); health.failureStreak = 0; }
  await writeState(run.env.DB, `health:${source}`, health);
}

async function processItem(run: Run, item: InboxItem): Promise<void> {
  const raw = JSON.parse(item.payload_json) as SourceEvent;
  const stored = await toStoredEvent(raw);
  const now = new Date().toISOString();
  if (!stored) { await finishItem(run.env.DB, item.id, 'review', null, 'no_ai_security_signal'); return; }
  if (!stored.publishedAt || Date.parse(stored.publishedAt) > Date.now() + 86400000) {
    await finishItem(run.env.DB, item.id, 'review', null, 'unknown_or_future_date'); return;
  }
  if (!item.historical && !isEventRecent(stored.publishedAt, Number(run.env.MAX_EVENT_AGE_DAYS ?? 60), Date.now())) {
    await finishItem(run.env.DB, item.id, 'review', null, 'historical_or_unknown_date'); return;
  }
  const persisted = await storeEvent(run.env.DB, stored, now);
  const stats = run.result.sourceStats[item.source];
  run.result.relevant += 1;
  if (persisted.inserted) { run.result.inserted += 1; stats.inserted += 1; }
  else { run.result.deduped += 1; stats.deduped += 1; }
  if (shouldAutoPublish(stored, run.env)) {
    const draft = await storeDraft(run.env.DB, persisted.eventId, buildDraftPost(stored, now, true), now);
    if (draft.inserted) run.result.draftsCreated += 1;
    await finishItem(run.env.DB, item.id, draft.status === 'published' ? 'done' : 'review', persisted.eventId,
      draft.status === 'published' ? 'published' : 'existing_editorial_draft');
  } else await finishItem(run.env.DB, item.id, 'review', persisted.eventId, 'publication_policy');
}

async function processPending(run: Run): Promise<void> {
  const caps = resolveRuntimeCaps(run.env, run.result.mode);
  for (const item of await pendingItems(run.env.DB, caps.maxProcessEvents - run.result.processed)) {
    if (!reserve(run, 4)) break;
    run.result.processed += 1;
    run.result.sourceStats[item.source].processed += 1;
    try { await processItem(run, item); }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Processing failed';
      run.result.errors.push(message); run.result.sourceStats[item.source].errors += 1;
      await retryItem(run.env.DB, item, message);
    }
  }
}

async function saveRun(run: Run, runId: string): Promise<void> {
  run.result.queuedForNextRun = await pendingCount(run.env.DB);
  const queued = await run.env.DB.prepare("SELECT source,count(*) AS count FROM ingestion_items WHERE status IN ('pending','retry') GROUP BY source")
    .all<{ source: SourceEvent['source']; count: number }>();
  for (const row of queued.results) run.result.sourceStats[row.source].queued = row.count;
  if (run.result.processed >= resolveRuntimeCaps(run.env, run.result.mode).maxProcessEvents && run.result.queuedForNextRun)
    run.result.stopReason = 'event_budget';
  if (run.result.status !== 'failed') run.result.status = run.result.errors.length || run.result.warnings.length || run.result.stopReason !== 'completed' ? 'degraded' : 'healthy';
  const finishedAt = new Date().toISOString();
  const payload = { runId, phase: 'completed', startedAt: run.startedAt, finishedAt, ...run.result };
  await writeState(run.env.DB, `run:latest:${run.result.mode}`, payload);
  await writeState(run.env.DB, 'run:latest:any', payload);
  await run.env.DB.prepare('INSERT INTO ingestion_runs(run_id,mode,status,started_at,finished_at,result_json) VALUES (?1,?2,?3,?4,?5,?6)')
    .bind(runId, run.result.mode, run.result.status, run.startedAt, finishedAt, JSON.stringify(payload)).run();
  await run.env.DB.prepare("DELETE FROM ingestion_runs WHERE finished_at < ?1")
    .bind(new Date(Date.now() - 90 * 86400000).toISOString()).run();
  console[run.result.status === 'healthy' ? 'log' : 'warn'](JSON.stringify({ event: 'ingestion_summary', ...payload }));
}

async function resumeBackfill(run: Run): Promise<void> {
  const active = await readState<Backfill & { enabled: boolean }>(run.env.DB, 'backfill:active');
  if (!run.options.backfill && active?.enabled && Date.now() < run.deadline) {
    const previousOptions = run.options;
    try {
      run.options = { ...previousOptions, backfill: active };
      for (const source of active.sources) {
        await scanSource(run, source);
        await processPending(run);
      }
    } finally { run.options = previousOptions; }
    await processPending(run);
    const states = await Promise.all(active.sources.flatMap((source) => sourceQueries(source, run.env)
      .map((query) => readState<ScanPosition>(run.env.DB, `backfill:${active.from}:${active.to}:${source}:${query}`))));
    if (states.every((position) => position?.complete)) await writeState(run.env.DB, 'backfill:active', { ...active, enabled: false });
  }
}

async function executeRun(run: Run): Promise<void> {
  await processPending(run);
  const sources = run.options.backfill?.sources ?? SOURCES;
  await Promise.all(sources.filter((source) => source !== 'hn' || run.env.ENABLE_HN_SOURCE !== 'false')
    .map(async (source) => {
      await scanSource(run, source);
      run.processing = (run.processing ?? Promise.resolve()).then(() => processPending(run));
      await run.processing;
    }));
  await processPending(run);
  await resumeBackfill(run);
  const enriched = await enrichPendingDrafts(run.env, run.fetchFn, run.deadline,
    Math.min(resolveRuntimeCaps(run.env, run.result.mode).llmEnrichMaxCalls,
      Math.max(0, resolveRuntimeCaps(run.env, run.result.mode).maxDbWrites - run.writes)));
  run.result.llmEnrichCalls += enriched.calls;
  run.result.warnings.push(...enriched.warnings);
  if (Date.now() >= run.deadline) run.result.stopReason = 'runtime_budget';
}

async function budgetedFetch(run: Run, fetchFn: typeof fetch): Promise<typeof fetch> {
  const nvdRequests = (await readState<number[]>(run.env.DB, 'quota:nvd') ?? []).filter((time) => time > Date.now() - 30000);
  return async (input, init) => {
    if (++run.requests > (run.result.mode === 'cron' ? 20 : 40)) throw new Error('Source request budget exhausted');
    if (String(input).startsWith('https://services.nvd.nist.gov/')) {
      while (nvdRequests.length && nvdRequests[0] <= Date.now() - 30000) nvdRequests.shift();
      if (nvdRequests.length >= (run.env.NVD_API_KEY ? 50 : 5)) throw new SourceHttpError(429, 60000, 'NVD local request quota reached; scan resumes next run');
      nvdRequests.push(Date.now());
      await writeState(run.env.DB, 'quota:nvd', nvdRequests);
    }
    return fetchFn(input, init);
  };
}

export async function runDurableIngestion(env: EnvBindings, fetchFn: typeof fetch = fetch,
  options: IngestionRunOptions = {}): Promise<IngestionRunResult> {
  const result = emptyResult(options.mode ?? 'manual');
  if (!env.DB) { result.errors.push('DB not configured'); result.status = 'failed'; return result; }
  const runId = options.runId ?? crypto.randomUUID();
  const startedAt = new Date().toISOString();
  const caps = resolveRuntimeCaps(env, result.mode);
  const run: Run = { env: { ...env, DB: env.DB }, fetchFn, options, result,
    deadline: Date.now() + caps.maxRuntimeMs, writes: 0, requests: 0, startedAt };
  let acquired = false;
  try {
    acquired = await acquireLease(env.DB, runId, startedAt);
    if (!acquired) { result.lockSkipped = true; result.status = 'locked'; return result; }
    await writeState(env.DB, `run:active:${result.mode}`, { runId, startedAt });
    run.fetchFn = await budgetedFetch(run, fetchFn);
    await executeRun(run);
    await saveRun(run, runId);
  } catch (error) {
    result.status = 'failed'; result.errors.push(error instanceof Error ? error.message : 'Ingestion failed');
    if (acquired) await saveRun(run, runId).catch(() => undefined);
  } finally {
    if (acquired) await releaseLease(env.DB, runId).catch((error) => result.errors.push(String(error)));
  }
  return result;
}

export async function ingestionHealth(env: EnvBindings) {
  if (!env.DB) return { status: 'failed', errors: ['Database unavailable'], sources: [], backlog: 0, history: [] };
  const latest = await readState<Record<string, unknown>>(env.DB, 'run:latest:cron');
  const sources = await Promise.all(SOURCES.filter((source) => source !== 'hn' || env.ENABLE_HN_SOURCE !== 'false')
    .map(async (source) => ({ source, ...await readState<SourceHealth>(env.DB!, `health:${source}`) })));
  const errors = sources.flatMap((source) => [...source.errors ?? [], ...source.warnings ?? []]);
  const pending = await env.DB.prepare("SELECT min(first_seen_at) AS oldest,sum(status='retry') AS retrying FROM ingestion_items WHERE status IN ('pending','retry')")
    .first<{ oldest: string | null; retrying: number | null }>();
  if (pending?.oldest && Date.now() - Date.parse(pending.oldest) > 6 * 3600000) errors.push('Ingestion backlog has waited more than six hours');
  const quarantine = await env.DB.prepare("SELECT count(*) AS count FROM ingestion_items WHERE reason='oversized_event'").first<{ count: number }>();
  if (quarantine?.count) errors.push(`${quarantine.count} oversized ingestion records require review`);
  if (!latest?.finishedAt || Date.now() - Date.parse(String(latest.finishedAt)) > 2 * 3600000) errors.push('Hourly cron heartbeat missing or stale');
  const history = await env.DB.prepare('SELECT run_id,mode,status,started_at,finished_at FROM ingestion_runs ORDER BY finished_at DESC LIMIT 20').all();
  const orphaned = await env.DB.prepare("SELECT e.id,e.source,e.title,e.published_at FROM ingested_events e LEFT JOIN draft_posts d ON d.event_id=e.id WHERE d.id IS NULL AND e.severity='high' ORDER BY e.created_at LIMIT 100").all();
  const latestAny = await readState<IngestionRunResult>(env.DB, 'run:latest:any');
  if (latestAny) errors.push(...latestAny.errors ?? [], ...latestAny.warnings ?? []);
  return { status: errors.length ? 'degraded' : 'healthy', errors: [...new Set(errors)], latest, sources,
    backlog: await pendingCount(env.DB), oldestPendingAt: pending?.oldest, retrying: pending?.retrying ?? 0,
    alertsEnabled: env.INGESTION_ALERTS_ENABLED === 'true',
    alertsConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID || env.RESEND_API_KEY && env.NOTIFY_EMAIL_TO),
    backfill: await readState(env.DB, 'backfill:active'), orphanedHighSeverity: orphaned.results, history: history.results };
}

export async function previewBackfill(env: EnvBindings, fetchFn: typeof fetch, backfill: Backfill) {
  const result = emptyResult('manual');
  const candidates: SourceEvent[] = [];
  const previewEnv = { ...env };
  const now = Date.now();
  for (const source of backfill.sources) for (const query of sourceQueries(source, env)) {
    if (Date.now() - now >= 12000) { result.errors.push('Preview time budget reached'); break; }
    const position = { start: backfill.from, end: new Date(Math.min(Date.parse(backfill.to), Date.parse(backfill.from) + WINDOW_MS)).toISOString(), offset: 0 };
    try {
      const page = await fetchSourcePage(source, { env: previewEnv, fetchFn, query, position, timeout: Math.max(1, 12000 - (Date.now() - now)) });
      result.fetched += page.events.length;
      result.warnings.push(...page.warnings);
      candidates.push(...page.events.filter((event) => isLikelyAiSecurityIncident(event.title, event.summary, source)));
    } catch (error) { result.errors.push(`${source}: ${error instanceof Error ? error.message : 'Preview failed'}`); }
  }
  const unique = [...new Map(candidates.map((event) => [`${event.source}:${event.externalId}`, event])).values()];
  return { dryRun: true, fetched: result.fetched, candidates: unique, errors: result.errors, warnings: result.warnings,
    note: 'Bounded first-page preview; execution resumes all pages in durable source windows. High-severity candidates meeting policy may publish; others require review.' };
}
