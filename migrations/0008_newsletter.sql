CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL CHECK(status IN ('pending','confirmed','unsubscribed','suppressed')) DEFAULT 'pending',
  confirmation_hash TEXT,
  confirmation_expires_at TEXT,
  unsubscribe_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  last_confirmation_at TEXT,
  consent_version TEXT NOT NULL DEFAULT 'weekly-digest-v1'
);
CREATE TABLE IF NOT EXISTS newsletter_editions (
  id TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS newsletter_outbox (
  id TEXT PRIMARY KEY,
  subscriber_id INTEGER NOT NULL REFERENCES newsletter_subscribers(id),
  edition_id TEXT REFERENCES newsletter_editions(id),
  kind TEXT NOT NULL CHECK(kind IN ('confirmation','digest')),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sending','accepted','failed','cancelled','review')) DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT,
  next_attempt_at TEXT NOT NULL,
  provider_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  UNIQUE(subscriber_id,edition_id)
);
CREATE INDEX IF NOT EXISTS newsletter_outbox_due ON newsletter_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_status ON newsletter_subscribers(status,id);
CREATE TABLE IF NOT EXISTS newsletter_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
