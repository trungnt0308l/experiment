CREATE TABLE IF NOT EXISTS ingestion_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_after TEXT,
  last_error TEXT,
  reason TEXT,
  event_id INTEGER,
  historical INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(source, external_id)
);
CREATE INDEX IF NOT EXISTS idx_ingestion_items_pending ON ingestion_items(status, retry_after, first_seen_at);
ALTER TABLE ingested_events ADD COLUMN canonical_id TEXT;
ALTER TABLE ingested_events ADD COLUMN source_updated_at TEXT;
ALTER TABLE ingested_events ADD COLUMN source_metadata_json TEXT;
UPDATE ingested_events SET canonical_id = upper(external_id) WHERE external_id LIKE 'CVE-%';
CREATE INDEX IF NOT EXISTS idx_ingested_events_canonical ON ingested_events(canonical_id);
CREATE TABLE IF NOT EXISTS ingestion_runs (
  run_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  result_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_finished ON ingestion_runs(finished_at DESC);
