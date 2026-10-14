import { sha256Hex, type SourceEvent } from './ingestion';

export type InboxItem = { id: number; source: SourceEvent['source']; payload_json: string; attempts: number; historical: number };
export const LEASE_KEY = 'lock:cron';
const LEASE_MS = 120000;
const MAX_EVENT_BYTES = 64000;
const eventBytes = (payload: string) => new TextEncoder().encode(payload).length;

function retainedEvent(event: SourceEvent, originalBytes: number): { payload: string; quarantined: boolean } {
  const metadata = { truncated: true, originalPayloadBytes: originalBytes };
  const payload = JSON.stringify({ ...event, metadata });
  if (eventBytes(payload) <= MAX_EVENT_BYTES) return { payload, quarantined: false };
  return { payload: JSON.stringify({ source: event.source, externalId: event.externalId.slice(0, 500),
    title: event.title.slice(0, 500), url: event.url.slice(0, 1000), summary: event.summary.slice(0, 4000),
    publishedAt: event.publishedAt, updatedAt: event.updatedAt, sourceSeverity: event.sourceSeverity,
    cveId: event.cveId?.slice(0, 100), metadata }), quarantined: true };
}

export async function readState<T>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT value FROM ingestion_state WHERE key = ?1').bind(key).first<{ value: string }>();
  if (!row) return null;
  try { return JSON.parse(row.value) as T; } catch { throw new Error(`Corrupt ingestion state: ${key}`); }
}

export async function writeState(db: D1Database, key: string, value: unknown, now = new Date().toISOString()): Promise<void> {
  await db.prepare(`INSERT INTO ingestion_state (key,value,updated_at) VALUES (?1,?2,?3)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`)
    .bind(key, JSON.stringify(value), now).run();
}

export async function acquireLease(db: D1Database, owner: string, now: string): Promise<boolean> {
  const result = await db.prepare(`INSERT INTO ingestion_state (key,value,updated_at) VALUES (?1,?2,?3)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
    WHERE datetime(ingestion_state.updated_at) <= datetime(?4)`)
    .bind(LEASE_KEY, owner, now, new Date(Date.parse(now) - LEASE_MS).toISOString()).run();
  return (result.meta.changes ?? 0) > 0;
}

export async function releaseLease(db: D1Database, owner: string): Promise<void> {
  await db.prepare('DELETE FROM ingestion_state WHERE key = ?1 AND value = ?2').bind(LEASE_KEY, owner).run();
}

export async function stageEvent(db: D1Database, event: SourceEvent, historical: boolean): Promise<'staged' | 'metadata_truncated' | 'quarantined'> {
  const original = JSON.stringify(event);
  const oversized = eventBytes(original) > MAX_EVENT_BYTES;
  const retained = oversized ? retainedEvent(event, eventBytes(original)) : { payload: original, quarantined: false };
  const status = retained.quarantined ? 'review' : 'pending';
  const reason = retained.quarantined ? 'oversized_event' : null;
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO ingestion_items
    (source,external_id,payload_json,payload_hash,historical,first_seen_at,last_seen_at,status,reason)
    VALUES (?1,?2,?3,?4,?5,?6,?6,?7,?8)
    ON CONFLICT(source,external_id) DO UPDATE SET
      status=CASE WHEN payload_hash!=excluded.payload_hash THEN excluded.status ELSE status END,
      reason=CASE WHEN payload_hash!=excluded.payload_hash THEN excluded.reason ELSE reason END,
      attempts=CASE WHEN payload_hash!=excluded.payload_hash THEN 0 ELSE attempts END,
      retry_after=CASE WHEN payload_hash!=excluded.payload_hash THEN NULL ELSE retry_after END,
      payload_json=excluded.payload_json,payload_hash=excluded.payload_hash,
      historical=max(historical,excluded.historical),last_seen_at=excluded.last_seen_at`)
    .bind(event.source, event.externalId, retained.payload, await sha256Hex(original), historical ? 1 : 0, now, status, reason).run();
  return retained.quarantined ? 'quarantined' : oversized ? 'metadata_truncated' : 'staged';
}

export async function pendingItems(db: D1Database, limit: number): Promise<InboxItem[]> {
  const rows = await db.prepare(`SELECT id,source,payload_json,attempts,historical FROM ingestion_items
    WHERE status IN ('pending','retry') AND (retry_after IS NULL OR retry_after <= ?1)
    ORDER BY first_seen_at,id LIMIT ?2`).bind(new Date().toISOString(), limit).all<InboxItem>();
  return rows.results;
}

export async function finishItem(db: D1Database, id: number, status: 'done' | 'review', eventId: number | null, reason: string): Promise<void> {
  await db.prepare(`UPDATE ingestion_items SET status=?2,event_id=?3,reason=?4,last_error=NULL,retry_after=NULL WHERE id=?1`)
    .bind(id, status, eventId, reason).run();
}

export async function retryItem(db: D1Database, item: InboxItem, error: string): Promise<void> {
  const delay = Math.min(3600000, 60000 * 2 ** Math.min(item.attempts, 6));
  await db.prepare(`UPDATE ingestion_items SET status='retry',attempts=attempts+1,last_error=?2,retry_after=?3 WHERE id=?1`)
    .bind(item.id, error.slice(0, 1000), new Date(Date.now() + delay).toISOString()).run();
}

export async function pendingCount(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT count(*) AS count FROM ingestion_items WHERE status IN ('pending','retry')").first<{ count: number }>();
  return row?.count ?? 0;
}
