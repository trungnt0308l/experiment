import type { EnvBindings } from './app';
import { llmEnrichIncident } from './llm';
import type { SourceEvent } from './ingestion';
import { acquireLease, readState, releaseLease, writeState } from './ingestion-storage';
import { resolveRuntimeCaps } from './ingestion';

type PendingDraft = { id: number; source: SourceEvent['source']; external_id: string; title: string;
  summary: string; url: string; published_at: string | null; payload_json: string | null; attempts: number };

async function pendingDrafts(db: D1Database, limit: number) {
  return db.prepare(`SELECT d.id,e.source,e.external_id,e.title,e.summary,e.url,e.published_at,i.payload_json,
      COALESCE(json_extract(s.value,'$.attempts'),0) AS attempts
    FROM draft_posts d JOIN ingested_events e ON e.id=d.event_id
    LEFT JOIN ingestion_items i ON i.source=e.source AND i.external_id=e.external_id
    LEFT JOIN ingestion_state s ON s.key='enrichment:item:' || d.id
    WHERE d.status='published' AND d.enriched_at IS NULL
      AND COALESCE(json_extract(s.value,'$.nextAttemptAt'),'') <= ?2
    ORDER BY attempts,d.created_at,d.id LIMIT ?1`)
    .bind(limit, new Date().toISOString()).all<PendingDraft>();
}

async function enrichDraft(env: EnvBindings & { DB: D1Database }, row: PendingDraft, fetchFn: typeof fetch, deadline: number) {
  const event: SourceEvent = row.payload_json ? JSON.parse(row.payload_json) : { source: row.source,
    externalId: row.external_id, title: row.title, summary: row.summary, url: row.url, publishedAt: row.published_at };
  const output = await llmEnrichIncident(env, event, fetchFn, Math.min(20000, deadline - Date.now()));
  if (!output) return;
  await env.DB.prepare(`UPDATE draft_posts SET enriched_summary=?2,enriched_impact=?3,enriched_remedy_json=?4,
    enrichment_model=?5,enriched_at=?6 WHERE id=?1 AND enriched_at IS NULL`)
    .bind(row.id, output.summary, output.impact, JSON.stringify(output.remedy), output.model, new Date().toISOString()).run();
}

// Publication and enrichment have independent retry paths: provider failures cannot hide incidents.
export async function enrichPendingDrafts(env: EnvBindings, fetchFn: typeof fetch, deadline: number, limit: number) {
  const result = { calls: 0, warnings: [] as string[] };
  if (!env.DB || !env.OPENAI_API_KEY || env.LLM_ENRICH_ENABLED === 'false' || limit <= 0) return result;
  const cooldown = await readState<{ until: string }>(env.DB, 'enrichment:cooldown');
  if (cooldown && Date.parse(cooldown.until) > Date.now()) return result;
  const rows = await pendingDrafts(env.DB, limit);
  for (const row of rows.results) {
    if (deadline - Date.now() < 1000) break;
    try {
      result.calls += 1;
      await enrichDraft({ ...env, DB: env.DB }, row, fetchFn, deadline);
    } catch {
      result.warnings.push('Optional enrichment deferred; published incidents retain deterministic content.');
      const attempts = row.attempts + 1;
      await writeState(env.DB, `enrichment:item:${row.id}`, { attempts,
        nextAttemptAt: new Date(Date.now() + Math.min(24, 2 ** Math.min(attempts, 5)) * 3600000).toISOString() });
      await writeState(env.DB, 'enrichment:cooldown', { until: new Date(Date.now() + 3600000).toISOString() });
      break;
    }
  }
  return result;
}

export async function runScheduledEnrichment(env: EnvBindings, fetchFn: typeof fetch = fetch): Promise<void> {
  if (!env.DB) return;
  const owner = `enrichment-${crypto.randomUUID()}`;
  if (!await acquireLease(env.DB, owner, new Date().toISOString())) return;
  try {
    const result = await enrichPendingDrafts(env, fetchFn, Date.now() + 45000, resolveRuntimeCaps(env, 'cron').llmEnrichMaxCalls);
    const cooldown = await readState<{ until: string }>(env.DB, 'enrichment:cooldown');
    const deferred = result.warnings.length || cooldown && Date.parse(cooldown.until) > Date.now();
    await writeState(env.DB, 'enrichment:latest', { ...result, status: deferred ? 'deferred' : result.calls ? 'healthy' : 'idle',
      finishedAt: new Date().toISOString(), cooldown });
  } catch {
    await writeState(env.DB, 'enrichment:latest', { status: 'deferred', finishedAt: new Date().toISOString(),
      warnings: ['Optional enrichment could not complete; published source content remains available.'] });
  } finally { await releaseLease(env.DB, owner); }
}
