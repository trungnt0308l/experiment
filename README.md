# AI Security Incident Radar

Current production status:
- Live domain: `https://aisecurityradar.com`
- Worker fallback: `https://ai-security-incident-radar-production.tuantrung.workers.dev`
- Waitlist endpoint: `POST /api/waitlist`
- Health check: `/health`
- Legal pages: `/privacy`, `/terms`, `/security`
- Incident content pages: `/incidents` and `/incidents/:slug`
- SEO endpoints: `/sitemap.xml` and `/robots.txt`
- Admin exports: `/api/admin/signups` and `/admin/signups` (token-protected)
- Ingestion trigger: `POST /api/admin/ingestion/run` (token-protected)
- Draft feed for social posts: `GET /api/admin/drafts` (token-protected)
- Ingestion feed (date-sorted): `GET /api/admin/ingestions` (token-protected)
- Draft review actions: `POST /api/admin/drafts/:id/approve`, `POST /api/admin/drafts/:id/publish`
- Ingestion reset action: `POST /api/admin/ingestion/reset`
- Browser admin console: `/admin/ops` (token entered in page, not URL)
- D1-backed persistence enabled
- Attribution tracking fields: `utmSource`, `utmMedium`, `utmCampaign`, `referrer`, `landingPath`
- Google Analytics enabled via `GA_MEASUREMENT_ID`

## Quick Start

```bash
npm install
npm run dev
```

## Verify

```bash
npm run typecheck
npm run test
```

## Operations

### Regular commands
1. Authenticate Wrangler (if needed):
```bash
npx wrangler login
```

2. Apply migrations:
```bash
npm run db:migrate:local
npm run db:migrate:remote
```

3. Deploy production:
```bash
npm run deploy:prod
```

### Admin export access
Set admin token as a Wrangler secret (not in git):
```bash
npx wrangler secret put ADMIN_API_TOKEN --env production
```

Use it via bearer header:
```bash
curl -H "Authorization: Bearer your-long-random-token" \
  "https://aisecurityradar.com/api/admin/signups?limit=100"
```

CSV export:
```bash
curl -H "Authorization: Bearer your-long-random-token" \
  "https://aisecurityradar.com/api/admin/signups?format=csv&limit=500"
```

Admin page (requires Authorization header with bearer token):
- `https://aisecurityradar.com/admin/signups`
- Use browser/API tooling that can send `Authorization: Bearer <token>`.

### Instant signup notifications
Optional secret vars:
```bash
npx wrangler secret put NOTIFY_EMAIL_TO --env production
npx wrangler secret put RESEND_API_KEY --env production
npx wrangler secret put TELEGRAM_BOT_TOKEN --env production
npx wrangler secret put TELEGRAM_CHAT_ID --env production
npx wrangler secret put NVD_API_KEY --env production
npx wrangler secret put GITHUB_API_TOKEN --env production
npx wrangler secret put OPENAI_API_KEY --env production
```

### Phase 1 ingestion pipeline (HN + NVD + CISA KEV + EUVD + GHSA + RSS)
Data ingestion runs on Worker cron (every 30 minutes via `wrangler.toml` triggers) and can be triggered manually.

Manual trigger:
```bash
curl -X POST \
  -H "Authorization: Bearer your-long-random-token" \
  "https://aisecurityradar.com/api/admin/ingestion/run"
```

Read generated drafts:
```bash
curl -H "Authorization: Bearer your-long-random-token" \
  "https://aisecurityradar.com/api/admin/drafts?limit=20"
```

Browser-based operation (no curl):
1. Open `https://aisecurityradar.com/admin/ops`
2. Paste `ADMIN_API_TOKEN` into the token field.
3. Click **Run Ingestion Now**.
4. Review drafts sorted by incident date.
5. Click **Approve** then **Publish** per draft.
6. Published drafts automatically appear on `/incidents` and `/incidents/:slug`, sorted newest first.
7. Use **Reset Ingestion DB** to clear ingested events and drafts before rerunning ingestion.

Feed overrides:
- Set `RSS_FEEDS` as a comma-separated list of RSS/Atom URLs in env vars.
- If `NVD_API_KEY` is unset, NVD connector still runs with public limits.
- If `GITHUB_API_TOKEN` is unset, GitHub advisories connector runs with stricter public rate limits.
- Set `SITE_URL` (for canonical tags, OG URLs, and sitemap URLs).
- LLM dedupe/enrichment (GPT-5 mini):
  - `OPENAI_MODEL` (default `gpt-5-mini`)
  - `LLM_DEDUPE_ENABLED=true|false`
  - `LLM_DEDUPE_MAX_CALLS` per ingestion run (default `6`)
  - `LLM_ENRICH_ENABLED=true|false`
  - `LLM_ENRICH_MAX_CALLS` auto-publish enrich calls per run (default `2`)
- Set `MAX_EVENT_AGE_DAYS` (default `60`) to exclude stale incidents from draft generation.
- Relevance gate is strict by default: HN/RSS items must include both AI and security signals.
- HN uses an incident-only gate (CVE/exploit/breach/prompt-injection patterns) and excludes common HN noise patterns (Show HN, benchmarks, generic launches).
- Set `HN_MAX_ITEMS` (default `8`) to cap HN subrequests and avoid Worker resource-limit errors.
- Set `ENABLE_HN_SOURCE=false` to disable HN ingestion temporarily.
- Auto-publish rule: incidents from trusted sources in `AUTO_PUBLISH_TRUSTED_SOURCES` (default `nvd`) and meeting `AUTO_PUBLISH_MIN_SEVERITY` (default `high`) are published immediately.

Behavior:
- On each new waitlist signup (`joined` only), app sends notification attempts to Email (Resend) and Telegram.
- If env vars are missing, the channel is skipped safely.
- Semantic dedupe uses GPT-5 mini only for shortlist candidates (cost-capped by `LLM_DEDUPE_MAX_CALLS`).
- Published incidents (auto-published and manually published drafts) are enriched by GPT-5 mini and stored in `draft_posts`.

### Post-deploy checks
1. Open `https://aisecurityradar.com`.
2. Submit one test waitlist entry.
3. Confirm GA realtime traffic in GA4.
4. Verify DB row exists in D1.

## Migrations
- `migrations/0001_waitlist.sql`
- `migrations/0002_waitlist_attribution.sql`
- `migrations/0003_ingestion_pipeline.sql`
- `migrations/0004_draft_publish_workflow.sql`
- `migrations/0005_llm_enrichment.sql`

Use `wrangler d1 migrations apply` via npm scripts for ordered execution and tracking.

## Secret Hygiene
- Never commit API keys or tokens into `wrangler.toml` or source files.
- Use Wrangler secrets for production values.
- Use local `.dev.vars` for development only.
- See `.dev.vars.example` for required local keys.

## Security Notes
- URL query token auth is disabled for admin endpoints; bearer token only.
- Admin and waitlist API responses send `Cache-Control: no-store`.
- Basic per-IP throttling is enabled on `/api/waitlist` to reduce abuse.
