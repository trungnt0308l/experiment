# Task: incident-publishing-check-mar7

## Meta
- **Status**: REVIEW
- **Branch**: fix/incident-publishing-check-mar7
- **PR**: (link once created)
- **Created**: 2026-03-11 19:58:58+07:00
- **Last Updated**: 2026-03-11 20:04:53+07:00

## Objective
Investigate why no new incidents appear to have been published since March 7, 2026.

## Plan
- [ ] Trace incident ingestion and publishing code paths
- [ ] Verify current source data and database state after March 7
- [ ] Identify and implement the fix if a defect exists
- [ ] Write tests
- [ ] Verification
- [ ] PR self-review

## Progress Log
- [2026-03-11 19:58:58+07:00] Started task. Checked out branch `fix/incident-publishing-check-mar7`.
- [2026-03-11 20:02:55+07:00] Verified the public archive and production D1 data. `ingested_events` continue through 2026-03-11, but `draft_posts` stop at 2026-03-07T01:00:15.651Z, so the issue is in auto-publish draft creation rather than ingestion or site rendering.
- [2026-03-11 20:02:55+07:00] Identified the likely regression in `src/ingestion.ts`: the 2026-03-07 SEO/content change introduced a default `AUTO_PUBLISH_MIN_CONFIDENCE` floor of `0.74`, while recent qualifying GHSA incidents are scoring around `0.45`, preventing draft creation after deployment.
- [2026-03-11 20:04:53+07:00] Lowered the default auto-publish confidence floor to `0.45` in `src/ingestion.ts`, made the same value explicit in `wrangler.toml`, and added regression coverage in `test/ingestion.test.ts` for sparse-but-valid GHSA advisories plus below-threshold behavior.
- [2026-03-11 20:04:53+07:00] Verification passed with `npm run typecheck` and `npm run test`. Manual verification included checking the live `/incidents` archive and remote D1 state to confirm the regression window and the set of missed post-2026-03-07 no-draft events.
- [2026-03-11 20:04:53+07:00] Completed PR self-review in `.tasks/incident-publishing-check-mar7-review.md`; no code issues found. Operational follow-up: after deployment, optionally backfill the three missed high-severity GHSA events ingested on 2026-03-10 and 2026-03-11.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [x] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
- Production is not deployed from this session, so the code fix is ready but not yet live.
- Three high-severity GHSA events already ingested on 2026-03-10 and 2026-03-11 still have no drafts; they require a post-deploy backfill if the archive gap should be closed retroactively.
