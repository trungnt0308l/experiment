# Task: post-ingestion-clarity-fixes

## Meta
- **Status**: VERIFICATION
- **Branch**: feat/ai-security-incident-radar-prd
- **PR**: (link once created)
- **Created**: 2026-02-14T14:02:00+07:00
- **Last Updated**: 2026-02-14T14:02:00+07:00

## Objective
Fix post-ingestion UX clarity: homepage sample source, CVE visibility expectations, and run-result interpretation.

## Plan
- [x] Step 1 — Review current sample alert query and ingestion relevance logic
- [x] Step 2 — Switch homepage sample to published incident source
- [x] Step 3 — Adjust NVD relevance handling for CVE visibility
- [x] Step 4 — Improve admin run status line with deduped counts
- [x] Step 5 — Add/update tests
- [x] Step 6 — Verification (typecheck + tests)

## Progress Log
- [2026-02-14T14:02:00+07:00] Started task and scoped fixes for sample alert sourcing, NVD relevance gate, and admin status messaging.

## Verification Checklist
- [ ] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [ ] Manual verification documented and executed
- [ ] PRD updated if scope changed

## Issues / Blockers
(none)
- [2026-02-14T14:03:19+07:00] Switched landing sample alert query to latest published incident (draft_posts status='published') instead of raw ingested_events.
- [2026-02-14T14:03:19+07:00] NVD relevance gate updated so NVD CVEs (already keyword-filtered) are eligible for ingestion.
- [2026-02-14T14:03:19+07:00] Admin run status now includes deduped count to explain inserted=0 runs.
- [2026-02-14T14:03:19+07:00] Verified with npm run typecheck, npm run test, and deployed production version d7fb29b9-a595-406e-ab3f-76d89fab73b8.
- [2026-02-14T14:07:26+07:00] Added safe content rendering: escaped incident text and blocked script/style/iframe/object/embed blocks in UI rendering.
- [2026-02-14T14:07:26+07:00] Added image extraction with relative URL resolution against source URL so ingested image references render with absolute paths.
- [2026-02-14T14:07:26+07:00] Normalized relative RSS item links to absolute URLs during ingestion parsing.
- [2026-02-14T14:07:26+07:00] Added tests: relative RSS URL normalization and incident-page sanitization/image-resolution.
- [2026-02-14T14:07:26+07:00] Deployed production version 40ce6884-4f0f-4ecc-beb7-0370a3ce7b50.
