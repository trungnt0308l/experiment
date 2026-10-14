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
- Summary cleanup trigger: `POST /api/admin/ingestion/normalize-summaries` (token-protected)
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
Data ingestion runs on Worker cron (hourly via `wrangler.toml` triggers) and can be triggered manually.

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
7. Use **Normalize Long Summaries** to repair oversized legacy advisory summaries.
8. Use **Check Source Health** to inspect failures, cooldowns, pending retries, and recovery progress. Resetting ingestion is destructive and is not a recovery procedure.

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
- Auto-publish rule: incidents from trusted sources in `AUTO_PUBLISH_TRUSTED_SOURCES` (default `nvd,cisa_kev,euvd,ghsa,rss,hn`) and meeting `AUTO_PUBLISH_MIN_SEVERITY` (default `high`) are published immediately.
- GHSA ingestion retains full bounded descriptions/metadata in the durable inbox, while keeping displayed summaries concise. A rejected source token falls back to public access once per run and remains visible as a warning.

Behavior:
- On each new waitlist signup (`joined` only), app sends notification attempts to Email (Resend) and Telegram.
- If env vars are missing, the channel is skipped safely.
- Collection/publication dedupe uses stable source IDs, canonical CVEs, and exact URLs without an LLM dependency.
- Published incidents receive optional bounded GPT-5 mini enrichment independently; failed provider calls leave deterministic incident content available and retry after cooldown.

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
- `migrations/0006_ingestion_runtime_state.sql`
- `migrations/0007_ingestion_reliability.sql`

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

## Reliability, recovery, and Windows verification

Use Windows Node 24 LTS. PowerShell commands:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:coverage
npm.cmd run build
```

Tests use a fixed calendar with advancing elapsed time, real SQLite migrations, and Cloudflare D1 integration. CI runs the same checks on `windows-latest`. Miniflare is pinned to the beta used by Wrangler 4.150 because the default older release has known vulnerable transitive dependencies; changing the simulator requires its matching API/configuration adapter.

Ingestion keeps durable per-source/query page positions and a normalized inbox in D1. Pending writes and draft publication retry independently, and all triggers share a 120-second owned lease (longer than the maximum 55-second run). NVD uses a persistent 30-second request quota and keyword rotation; sources honor HTTP cooldowns. Completed normal scans switch to modified-date windows with a two-day overlap. Snapshot sources (RSS, KEV, EUVD latest) cannot guarantee historical completeness; recovery targets NVD and GHSA.

HTTP 403/429 and 5xx failures pause further source calls and keep checkpoints for a later run. Repeated failures back off from five minutes to six hours, honoring longer upstream retry/reset headers. Alerts track each problem separately for six hours so rotating NVD keywords and temporarily recovering sources do not resend the same outage; a new problem still alerts immediately. A rejected `GITHUB_API_TOKEN` falls back to public access, whose shared-IP quota may also return 403. Replace the source token with `npx wrangler secret put GITHUB_API_TOKEN --env production`; a code fix cannot make a revoked token valid.

`INGEST_GHSA_MAX_ITEMS_PER_RUN` limits collected records across normal and historical scans together. GHSA uses a compatible page size and saves a within-page offset when existing larger pages exceed the remaining allowance. Oversized advisory metadata is replaced with an explicit truncation marker while retaining the authoritative summary, identity, dates, and severity. If core content still exceeds the 64,000-byte inbox limit, retain a bounded record for review (`ingestion_items.reason='oversized_event'`) and advance the page; corrected upstream content can resume processing. Health reports quarantined records. Original payload hashes preserve change detection when metadata is discarded.

Run the read-only upstream audit with `node .tasks/incident-ingestion-audit-oct13-public.mjs`. Its NVD queue spaces public calls by six seconds (600ms with an optional `NVD_API_KEY` environment variable), applies bounded 429/5xx retries, and exits with a failure status when any check is incomplete. Retry delays over one minute stop the affected check instead of waiting through a long outage. Keys are sent only to NVD and are never logged.

`GET /api/admin/ingestion/health` requires the admin bearer token. It reports source failures, cooldowns, heartbeat freshness, oldest pending work, retry counts, historical high-severity orphans, and 20 recent runs. Run history is retained for 90 days. `INGESTION_ALERTS_ENABLED=true` enables deduplicated alerts using existing operator notification credentials, never the subscriber list. Configure an independent authenticated monitor for missed cron heartbeats: a stopped scheduler cannot send its own alert.

Stop future historical scans with authenticated `POST /api/admin/ingestion/backfill/stop`; an in-flight page may finish. A different active recovery range cannot be silently replaced. Public sitemap output uses a 45,000-incident protocol budget; add a sitemap index before reaching that scale (archive/detail access itself has no such cutoff).

For the May-onward gap, open `/admin/ops`, check health, expand **Recover historical advisories**, and preview the May 1 range before starting. The preview samples the first page of each source query, not a full missing-record count. Execution retains all matching pages and resumes over subsequent hourly runs. Only records meeting the existing trusted-source, severity, and confidence policy auto-publish. Other records remain reviewable. Existing drafts/pages and their publication timestamps are preserved. Cancel or adjust an active recovery only after inspecting its progress.

Production rollout: record the current Worker version and D1 Time Travel bookmark; apply migration 0007 before deploying the reviewed code. Verify health, normal ingestion, old detail URLs, and source cooldowns before recovery. The additive migration permits rollback to the previous Worker while keeping the inbox/recovery history. Do not roll back or clear the production database to reverse a code deployment. See `.tasks/ingestion-reliability.md` for actual rollout results.
