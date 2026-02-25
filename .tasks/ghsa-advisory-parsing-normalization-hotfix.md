# Task: ghsa-advisory-parsing-normalization-hotfix

## Meta
- **Status**: VERIFICATION
- **Branch**: fix/ghsa-advisory-parsing-normalization-hotfix
- **PR**: (link once created)
- **Created**: 2026-02-25 22:22:35 +07:00
- **Last Updated**: 2026-02-25 22:31:50 +07:00

## Objective
Fix GHSA ingestion and long-summary rendering so incident/homepage views remain concise and stable.

## Plan
- [x] Review current GHSA ingestion, summary rendering, and admin ops pathways
- [x] Implement GHSA summary-first parser and cross-source summary normalization safeguards
- [x] Add render-time summary hard caps for incident page/home sample + SEO description guard
- [x] Add admin endpoint and ops UI action for one-time long-summary normalization (all sources)
- [x] Write/update tests for ingestion, endpoint, and rendering regressions
- [x] Step 6 - Verification
- [x] Step 7 - PR self-review

## Progress Log
- [2026-02-25 22:22:35 +07:00] Started task. Checked out branch `fix/ghsa-advisory-parsing-normalization-hotfix`.
- [2026-02-25 22:22:35 +07:00] Completed required startup checks: read `.tasks/lessons.md`, read `PRD.md`, checked git status, synced `main`, created hotfix branch.
- [2026-02-25 22:31:50 +07:00] Implemented ingestion hotfixes in `src/ingestion.ts`: GHSA summary-first parser, markdown/code cleanup, summary caps, and long-summary normalization routine for `ingested_events` + `draft_posts.enriched_summary`.
- [2026-02-25 22:31:50 +07:00] Implemented render and API hotfixes in `src/app.ts` and `src/ui.ts`: bounded summary rendering, SEO description cap, token-wrap CSS safeguards, new admin endpoint `POST /api/admin/ingestion/normalize-summaries`, and admin ops button `Normalize Long Summaries`.
- [2026-02-25 22:31:50 +07:00] Added/updated tests in `test/ingestion.test.ts` and `test/app.test.ts` for GHSA parsing behavior, summary normalization routine, new admin endpoint auth/DB/success paths, homepage sample bounding, and incident SEO description bounds.
- [2026-02-25 22:31:50 +07:00] Ran verification commands: `npm run typecheck` and `npm run test` (both pass).
- [2026-02-25 22:31:50 +07:00] Created PR self-review file: `.tasks/ghsa-advisory-parsing-normalization-hotfix-review.md`.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [ ] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
- Manual production verification pending deployment (run normalization once and verify homepage + affected incident URL).
