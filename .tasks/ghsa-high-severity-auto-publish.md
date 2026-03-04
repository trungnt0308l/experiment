# Task: ghsa-high-severity-auto-publish

## Meta
- **Status**: REVIEW
- **Branch**: fix/ghsa-high-severity-auto-publish
- **PR**: (link once created)
- **Created**: 2026-03-04T21:53:21+07:00
- **Last Updated**: 2026-03-04T22:04:37+07:00

## Objective
Fix GitHub advisory cronjob ingestion so high-severity items are auto-published.

## Plan
- [x] Identify auto-publish gating logic for GitHub advisory ingestions
- [x] Implement fix for high-severity auto-publish path
- [x] Step N — Write tests
- [x] Step N+1 — Verification
- [x] Step N+2 — PR self-review

## Progress Log
- [2026-03-04T21:53:21+07:00] Started task. Checked out branch fix/ghsa-high-severity-auto-publish and began tracing ingestion publish behavior.
- [2026-03-04T21:56:39+07:00] Root-caused auto-publish miss: default trusted sources excluded ghsa, and GHSA connector ignored API severity. Implemented code/config fix and added GHSA regression tests.
- [2026-03-04T21:59:12+07:00] Expanded auto-publish defaults/config to include all sources (nvd,cisa_kev,euvd,ghsa,rss,hn), added RSS high-severity regression coverage, and reran verification (`npm run typecheck`, `npm run test`).
- [2026-03-04T22:04:37+07:00] Completed PR self-review and saved checklist/results to `.tasks/ghsa-high-severity-auto-publish-review.md`.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [ ] No lint/type errors
- [ ] Manual verification documented and executed
- [ ] PRD updated if scope changed

## Issues / Blockers
- Rebase onto main blocked by existing unstaged workspace changes present before starting this task.
- Lint verification is not available in this repository (`package.json` has no lint script); typecheck + tests were executed.
