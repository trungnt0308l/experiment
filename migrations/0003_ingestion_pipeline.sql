CREATE TABLE IF NOT EXISTS ingested_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT,
  published_at TEXT,
  severity TEXT NOT NULL DEFAULT 'medium',
  confidence REAL NOT NULL DEFAULT 0.5,
  fingerprint TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ingested_events_source_external
ON ingested_events(source, external_id);

CREATE INDEX IF NOT EXISTS idx_ingested_events_published_at
ON ingested_events(published_at DESC);

CREATE TABLE IF NOT EXISTS draft_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',
  headline TEXT NOT NULL,
  linkedin_text TEXT NOT NULL,
  x_text TEXT NOT NULL,
  tags TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES ingested_events(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_draft_posts_created_at
ON draft_posts(created_at DESC);
