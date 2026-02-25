# Task: homepage-friction-autopublish-all-high

## Meta
- **Status**: DONE
- **Branch**: feat/homepage-friction-autopublish-all-high
- **PR**: (link once created)
- **Created**: 2026-02-25 21:55:51
- **Last Updated**: 2026-02-25 22:03:49

## Objective
Reduce homepage waitlist friction, revamp homepage conversion messaging with cost-of-delay facts, and auto-publish high severity incidents across all sources with a one-time 60-day backfill.

## Plan
- [x] Step 1 — Remove risk checkbox friction and make interests optional
- [x] Step 2 — Revamp homepage copy/layout with sourced cost-of-delay facts
- [x] Step 3 — Expand auto-publish policy to all sources and add one-time 60-day backfill API + admin UI trigger
- [x] Step 4 — Update config/docs/PRD for new defaults and behavior
- [x] Step 5 — Write and update tests for homepage, ingestion policy, and admin endpoints
- [x] Step 6 — Verification (typecheck + tests + manual checks)
- [x] Step 7 — PR self-review

## Progress Log
- [2026-02-25 21:55:51] Started task. Completed startup checks (lessons read, PRD path check, git status/pull) and created branch `feat/homepage-friction-autopublish-all-high`.
- [2026-02-25 22:00:16] Updated ingestion policy defaults to trust all sources for auto-publish, added explicit `AUTO_PUBLISH_TRUSTED_SOURCES=all` handling, and implemented one-time 60-day high-severity backfill helper.
- [2026-02-25 22:00:16] Added admin API route `POST /api/admin/ingestion/autopublish-backfill` with auth and DB checks, plus no-store response headers.
- [2026-02-25 22:01:02] Removed homepage risk checkbox friction and client-side required-risk validation; waitlist submission now supports optional interests.
- [2026-02-25 22:01:02] Revamped homepage messaging with new value proposition and a source-linked cost-of-delay facts section (IBM, Verizon, ENISA links).
- [2026-02-25 22:01:54] Added admin ops UI button for one-time backfill (`Backfill Auto-Publish (60d)`) with confirmation and result summary status.
- [2026-02-25 22:02:21] Updated configs/docs/PRD (`wrangler.toml`, `.dev.vars.example`, `README.md`, `PRD.md`) to reflect all-source default auto-publish and backfill workflow.
- [2026-02-25 22:03:06] Updated automated tests for homepage changes, optional interests signup acceptance, auto-publish source behavior, and new backfill endpoint auth/DB checks.
- [2026-02-25 22:03:21] Verification complete: `npm run typecheck` and `npm run test` both passed.
- [2026-02-25 22:03:49] Completed PR self-review checklist in `.tasks/homepage-friction-autopublish-all-high-review.md`.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [x] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
- Remote D1 validation unavailable from this environment due Cloudflare API auth error 7403.
