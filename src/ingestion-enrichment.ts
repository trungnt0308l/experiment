import type { EnvBindings } from './app';
import { llmEnrichIncident } from './llm';
import type { SourceEvent } from './ingestion';
import { readState, writeState } from './ingestion-storage';

type PendingDraft = { id: number; source: SourceEvent['source']; external_id: string; title: string;
  summary: string; url: string; published_at: string | null; payload_json: string | null };

// Publication and enrichment have independent retry paths: provider failures cannot hide incidents.
export async function enrichPendingDrafts(env: EnvBindings, fetchFn: typeof fetch, deadline: number, limit: number) {
  const result = { calls: 0, warnings: [] as string[] };
  if (!env.DB || !env.OPENAI_API_KEY || env.LLM_ENRICH_ENABLED === 'false' || limit <= 0) return result;
  const cooldown = await readState<{ until: string }>(env.DB, 'enrichment:cooldown');
  if (cooldown && Date.parse(cooldown.until) > Date.now()) return result;
  const rows = await env.DB.prepare(`SELECT d.id,e.source,e.external_id,e.title,e.summary,e.url,e.published_at,i.payload_json
    FROM draft_posts d JOIN ingested_events e ON e.id=d.event_id
    LEFT JOIN ingestion_items i ON i.source=e.source AND i.external_id=e.external_id
    WHERE d.status='published' AND d.enriched_at IS NULL ORDER BY d.created_at,d.id LIMIT ?1`)
    .bind(limit).all<PendingDraft>();
  for (const row of rows.results) {
    if (Date.now() >= deadline) break;
    try {
      const event: SourceEvent = row.payload_json ? JSON.parse(row.payload_json) : { source: row.source,
        externalId: row.external_id, title: row.title, summary: row.summary, url: row.url, publishedAt: row.published_at };
      result.calls += 1;
      const output = await llmEnrichIncident(env, event, fetchFn, Math.min(10000, deadline - Date.now()));
      if (!output) continue;
      await env.DB.prepare(`UPDATE draft_posts SET enriched_summary=?2,enriched_impact=?3,enriched_remedy_json=?4,
        enrichment_model=?5,enriched_at=?6 WHERE id=?1 AND enriched_at IS NULL`)
        .bind(row.id, output.summary, output.impact, JSON.stringify(output.remedy), output.model, new Date().toISOString()).run();
    } catch {
      result.warnings.push('Optional enrichment deferred; published incidents retain deterministic content.');
      await writeState(env.DB, 'enrichment:cooldown', { until: new Date(Date.now() + 3600000).toISOString() });
      break;
    }
  }
  return result;
}
