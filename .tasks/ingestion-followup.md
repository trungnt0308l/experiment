# Task: ingestion-followup

## Meta
- **Status**: DONE
- **Branch**: fix/ingestion-followup
- **PR**: https://github.com/trungnt0308l/experiment/pull/4
- **Created**: 2026-10-14
- **Last Updated**: 2026-10-14

## Objective
Investigate recurring ingestion alerts and validate/fix the P1 and two P2 findings on PRs #2 and #3.

## Plan
- [x] Inspect upstream errors, retry/cooldown/alert behavior, and review findings
- [x] Fix confirmed defects and document operational follow-up
- [x] Write regression tests for confirmed behavior and edge cases
- [x] Verification: full tests with coverage, typecheck, lint/build where available, manual checks
- [x] PR self-review, commit, push, create PR

## Progress Log
- [2026-10-14] Started task; read lessons and PRD, located experiment repository, retrieved both PR discussions. Existing branch is fix/ingestion-reliability; tracked node_modules have pre-existing local changes. Preparing dedicated branch without discarding user changes.
- [2026-10-14] Verified all three review findings. GitHub confirms both PRs are open and main remains cb7b707. Synced remote using OpenSSL (Windows Schannel failed). Main is already an ancestor of deployed PR #3; rebase was unnecessary and rejected due to the pre-existing tracked dependency changes.
- [2026-10-14] Created a dedicated working tree at D:/Working/cursor/experiment-ingestion-followup on fix/ingestion-followup, based on deployed PR #3. This permits writes without changing existing file ACLs or user changes. Implemented bounded oversized-record retention/quarantine, GHSA cap with partial-page checkpoints, 5xx cooldown/backoff, preservation of token warnings on failed fallback, and per-issue alert suppression.
- [2026-10-14] Restored the public audit script from PR #2 and added a shared NVD request queue, optional API key, bounded retries, and nonzero exit on incomplete evidence. Thirteen new regression tests pass. Updated README, PRD changelog, and the mistake ledger for the confirmed review findings. Initial typecheck passes.
- [2026-10-14] Full suite with coverage passed: 112 tests, 81.16% overall line coverage, storage/network/alerts 100%, runtime 98.05%. Worker dry-run build succeeded. Strict typecheck found a widened parameter-table tuple in a new test; corrected it and recorded the lesson. Redirecting Wrangler logs to workspace storage for a clean repeated build.
- [2026-10-14] Final typecheck, lint (including new JavaScript tests), syntax and whitespace checks, and workspace-logged Worker dry-run build passed. The paced live read-only audit completed: all eight NVD checks, public GHSA, EUVD, public archive, and official KEV GitHub mirror returned 200. CISA website feed returned 403 from this host; the audit correctly exited 1 and explicitly marked incomplete evidence. These host checks do not prove current Worker source health; saved Cloudflare OAuth returns 401.
- [2026-10-14] Saved senior self-review and committed all reviewed files as 4f52141. Git's default Windows credential store failed to persist credentials during push; retrying with the existing GitHub CLI credential helper. Extracted the audit request helper to meet the project's function-size convention; repeating its regression tests before pushing.
- [2026-10-14] Pushed 00d87c2 with the existing GitHub CLI helper and created PR #4 against PR #3's deployed branch. Windows CI found a clock-sensitive metadata-only test fixture (publication time was regenerated twice); reuse one baseline event and repeat local checks/CI. Production code is unaffected by this test correction.
- [2026-10-14] On the user's access question, checked Wrangler's OAuth lifecycle: the saved refresh token works automatically. Confirmed user/account read and D1/Worker script write scopes, a successful zero-write production D1 health query, and Worker version access. Latest production cron at 2026-10-14T13:00:58Z finished at 13:01:12Z, published five incidents, has zero queued work, and reports healthy NVD. GHSA still reports rejected token/public 403 and collected 100 records despite its configured cap; recovery remains enabled. No production writes/deployments performed.
- [2026-10-14] Final code d1d6258 passed the full local 112-test coverage suite, typecheck and lint. Windows PR CI run 38573823650 passed clean install, types, lint, all 112 tests/coverage, and Worker build: https://github.com/trungnt0308l/experiment/actions/runs/38573823650. PR #4 is mergeable and ready for review. Investigation and requested fixes are complete; production deployment and owner-managed source token rotation remain follow-ups. This final commit records verification only.

## Verification Checklist
- [x] Confirmed review defects fixed with regressions; operational token rotation remains an owner follow-up
- [x] Tests pass: 112 with coverage, including SQLite and Cloudflare D1 integrations
- [x] No lint/type errors; Worker dry-run build and both audit syntax checks pass
- [x] Manual verification documented and executed: paced read-only upstream audit, preserving a failing result for CISA's 403
- [x] PRD and README updated for bounded retention, cap checkpoints, backoff, alert suppression, and audit behavior

## Issues / Blockers
- Source GITHUB_API_TOKEN remains invalid and requires replacement by the owner. Cloudflare and GitHub access are verified. Code is prepared in PR #4; it has not been deployed or merged.
