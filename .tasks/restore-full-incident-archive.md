# Task: restore-full-incident-archive

## Meta
- **Status**: DONE
- **Branch**: fix/restore-full-incident-archive
- **PR**: PR not created locally; compare URL https://github.com/trungnt0308l/experiment/pull/new/fix/restore-full-incident-archive
- **Created**: 2026-03-07T12:01:21.9101555+07:00
- **Last Updated**: 2026-03-07T12:09:40.1402589+07:00

## Objective
Restore public visibility for all published incidents by showing them in the incidents archive, indexing every incident page, and keeping every published incident in the sitemap.

## Plan
- [x] Step 1 - Create task branch and task tracking file
- [x] Step 2 - Inspect current archive, sitemap, and robots filtering logic
- [x] Step 3 - Patch app and UI rendering to restore all published incidents publicly
- [x] Step 4 - Write and update tests for restored behavior
- [x] Step 5 - Verification
- [x] Step 6 - PR self-review

## Progress Log
- [2026-03-07T12:01:21.9101555+07:00] Started task. Checked out branch `fix/restore-full-incident-archive`.
- [2026-03-07T12:06:16.0871670+07:00] Removed archive and sitemap filtering in `src/app.ts`, restored default indexing for incident pages in `src/ui.ts`, and updated landing/methodology copy to match the restored public behavior.
- [2026-03-07T12:06:16.0871670+07:00] Updated `test/app.test.ts` to assert weak incident pages remain indexable and visible in both `/incidents` and `/sitemap.xml`.
- [2026-03-07T12:06:16.0871670+07:00] Updated `PRD.md` to reflect the restored public archive/indexation policy.
- [2026-03-07T12:06:16.0871670+07:00] Verification completed with `npm run typecheck`, `npm run test`, and an in-memory manual render check confirming archive inclusion, `index, follow`, and sitemap inclusion for a weak incident slug.
- [2026-03-07T12:06:16.0871670+07:00] Completed PR self-review in `.tasks/restore-full-incident-archive-review.md`; no blocking issues found.
- [2026-03-07T12:09:40.1402589+07:00] Committed changes as `fix(restore-full-incident-archive): restore public incident indexing` (`1d31622`) and pushed branch `fix/restore-full-incident-archive` to `origin`.
- [2026-03-07T12:09:40.1402589+07:00] `gh` is not installed in this environment, so the branch was pushed but the PR itself was not created locally.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [x] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
- GitHub CLI is not installed in this environment, so PR creation must be completed via the compare URL in the task metadata.
