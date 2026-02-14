# Task: manual-draft-flow

## Meta
- **Status**: VERIFICATION
- **Branch**: feat/ai-security-incident-radar-prd
- **PR**: (link once created)
- **Created**: 2026-02-14T15:00:00Z
- **Last Updated**: 2026-02-14T15:00:00Z

## Objective
Change admin workflow so ingestion does not auto-create drafts; drafts are created manually per ingestion item.

## Plan
- [x] Step 1 — Review current ingestion + admin flow
- [x] Step 2 — Stop auto draft creation in ingestion pipeline
- [x] Step 3 — Add admin API to create draft from ingestion item
- [x] Step 4 — Update admin UI to remove Drafts panel and add per-ingestion Create Draft action
- [x] Step 5 — Write tests and run verification

## Progress Log
- [2026-02-14T15:00:00Z] Started task. Reviewed ingestion pipeline and admin UI code paths.
- [2026-02-14T15:00:00Z] Updated ingestion pipeline to store events only and stop auto draft creation.
- [2026-02-14T15:00:00Z] Added admin endpoint to create draft from ingestion item and extended ingestion API row with draft state.
- [2026-02-14T15:00:00Z] Reworked admin UI: removed Drafts panel and Load Drafts control; added per-ingestion Create Draft / Approve / Publish / Remove actions.
- [2026-02-14T15:00:00Z] Added tests and completed verification (`npm run typecheck`, `npm run test`).

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [ ] Manual verification documented and executed
- [ ] PRD updated if scope changed

## Issues / Blockers
(none)
