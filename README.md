# AI Security Incident Radar

Phase 0 implementation:
- Landing page at `/`
- Waitlist endpoint at `POST /api/waitlist`
- Health check at `/health`
- D1-backed persistence (when binding is configured)
- Attribution tracking fields (`utmSource`, `utmMedium`, `utmCampaign`, `referrer`, `landingPath`)
- Optional Google Analytics injection via `GA_MEASUREMENT_ID`

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

## Operator Handoff (Minimal Manual Work)

### What I could automate in code
- Added migration automation commands:
  - `npm run db:migrate:local`
  - `npm run db:migrate:remote`
- Added production deploy command:
  - `npm run deploy:prod`
- Added optional GA script injection controlled by `GA_MEASUREMENT_ID`.
- Added UTM/referrer capture from URL and browser context.

### What you still need to do (credentials-required)
1. Authenticate Wrangler (one time):
```bash
npx wrangler login
```

2. Create D1 database:
```bash
npx wrangler d1 create ai-security-radar
```

3. Update `wrangler.toml` by uncommenting and filling `[[d1_databases]]`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "ai-security-radar"
database_id = "<your-d1-database-id>"
migrations_dir = "migrations"
```

4. Apply migrations:
```bash
npm run db:migrate:local
npm run db:migrate:remote
```

5. Set GA Measurement ID in `wrangler.toml`:
```toml
[vars]
APP_NAME = "AI Security Incident Radar"
GA_MEASUREMENT_ID = "G-XXXXXXXXXX"
```

6. Deploy:
```bash
npm run deploy:prod
```

### GA Setup Notes
- Create GA4 property + Web Data Stream.
- Use the stream measurement ID (`G-...`) in `GA_MEASUREMENT_ID`.
- Validate events in GA Realtime after first page visit.

## Migrations
- `migrations/0001_waitlist.sql`
- `migrations/0002_waitlist_attribution.sql`

Use `wrangler d1 migrations apply` via npm scripts for ordered execution and tracking.