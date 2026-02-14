ALTER TABLE draft_posts ADD COLUMN enriched_summary TEXT;
ALTER TABLE draft_posts ADD COLUMN enriched_impact TEXT;
ALTER TABLE draft_posts ADD COLUMN enriched_remedy_json TEXT;
ALTER TABLE draft_posts ADD COLUMN enrichment_model TEXT;
ALTER TABLE draft_posts ADD COLUMN enriched_at TEXT;

CREATE INDEX IF NOT EXISTS idx_draft_posts_enriched_at
ON draft_posts(enriched_at DESC);
