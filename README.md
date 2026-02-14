# AI Security Incident Radar

Current production status:
- Live domain: `https://aisecurityradar.com`
- Worker fallback: `https://ai-security-incident-radar-production.tuantrung.workers.dev`
- Waitlist endpoint: `POST /api/waitlist`
- Health check: `/health`
- Legal pages: `/privacy`, `/terms`, `/security`
- Admin exports: `/api/admin/signups` and `/admin/signups` (token-protected)
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
Set an admin token in `wrangler.toml`:
```toml
[env.production.vars]
ADMIN_API_TOKEN = "your-long-random-token"
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

Admin page:
- `https://aisecurityradar.com/admin/signups?token=your-long-random-token`

### Instant signup notifications
Optional env vars:
```toml
[env.production.vars]
NOTIFY_EMAIL_TO = "security@aisecurityradar.com"
RESEND_API_KEY = "re_xxx"
TELEGRAM_BOT_TOKEN = "123456:abc..."
TELEGRAM_CHAT_ID = "123456789"
```

Behavior:
- On each new waitlist signup (`joined` only), app sends notification attempts to Email (Resend) and Telegram.
- If env vars are missing, the channel is skipped safely.

### Post-deploy checks
1. Open `https://aisecurityradar.com`.
2. Submit one test waitlist entry.
3. Confirm GA realtime traffic in GA4.
4. Verify DB row exists in D1.

## Migrations
- `migrations/0001_waitlist.sql`
- `migrations/0002_waitlist_attribution.sql`

Use `wrangler d1 migrations apply` via npm scripts for ordered execution and tracking.
