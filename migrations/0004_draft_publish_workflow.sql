ALTER TABLE draft_posts ADD COLUMN approved_at TEXT;
ALTER TABLE draft_posts ADD COLUMN published_at TEXT;
ALTER TABLE draft_posts ADD COLUMN slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_draft_posts_slug
ON draft_posts(slug)
WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_draft_posts_status_published
ON draft_posts(status, published_at DESC);
