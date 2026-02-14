# AI Security Incident Radar

Current production status:
- Live domain: `https://aisecurityradar.com`
- Worker fallback: `https://ai-security-incident-radar-production.tuantrung.workers.dev`
- Waitlist endpoint: `POST /api/waitlist`
- Health check: `/health`
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

### Post-deploy checks
1. Open `https://aisecurityradar.com`.
2. Submit one test waitlist entry.
3. Confirm GA realtime traffic in GA4.
4. Verify DB row exists in D1.

## Migrations
- `migrations/0001_waitlist.sql`
- `migrations/0002_waitlist_attribution.sql`

Use `wrangler d1 migrations apply` via npm scripts for ordered execution and tracking.
