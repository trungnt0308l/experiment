# Task: p0-p1-sources-and-seo

## Meta
- **Status**: VERIFICATION
- **Branch**: feat/ai-security-incident-radar-prd
- **PR**: (link once created)
- **Created**: 2026-02-14T13:05:28+07:00
- **Last Updated**: 2026-02-14T13:08:53+07:00

## Objective
Add P0+P1 trusted ingestion sources (including GitHub Security Advisories) and implement sitemap + SEO meta tags across pages.

## Plan
- [x] Step 1 — Review current ingestion sources and HTML rendering paths
- [x] Step 2 — Add P0+P1 source defaults and GitHub Advisories connector
- [x] Step 3 — Add SEO primitives (meta tags, canonical, OG/Twitter, robots, sitemap)
- [x] Step 4 — Write/update tests for new behavior
- [x] Step 5 — Verification (tests/typecheck)
- [ ] Step 6 — PR self-review

## Progress Log
- [2026-02-14T13:05:28+07:00] Started task. Reviewed current ingestion pipeline and page rendering code.

## Verification Checklist
- [ ] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [ ] Manual verification documented and executed
- [ ] PRD updated if scope changed

## Issues / Blockers
(none)

- [2026-02-14T13:08:53+07:00] Added connectors for CISA KEV, ENISA EUVD, and GitHub Security Advisories; expanded trusted RSS defaults for P0/P1 sources.
- [2026-02-14T13:08:53+07:00] Added SEO meta/canonical/OG/Twitter tags across public pages and noindex for admin ops.
- [2026-02-14T13:08:53+07:00] Added /sitemap.xml and /robots.txt routes and tests for SEO endpoints.
- [2026-02-14T13:08:53+07:00] Verification: npm run typecheck and npm run test passed.
