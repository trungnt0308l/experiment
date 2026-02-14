# AI Security Incident Radar

Phase 0 bootstrap implementation:
- Landing page at `/`
- Waitlist endpoint at `POST /api/waitlist`
- Health check at `/health`
- Email duplicate detection (in-memory fallback)

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

## D1 Setup (optional, recommended for persistence)

1. Create DB:
```bash
wrangler d1 create ai-security-radar
```

2. Add returned `database_id` to `wrangler.toml` in `[[d1_databases]]`.

3. Apply migration:
```bash
wrangler d1 execute ai-security-radar --file migrations/0001_waitlist.sql
```

Without D1 binding, the app uses in-memory storage for local development/testing.