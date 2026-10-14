## PR Review — ingestion-followup P1 follow-up

### Summary
Personal review completed before committing the fix for PR #4 discussion r4271541950. The P1 is valid: an intentional local NVD quota pause reused HTTP 429 and entered persisted exponential outage backoff. Reproduction against the previous code collected [5,5,5,5,5,0,5,0,0,5] pages over ten hourly runs. The fixed pipeline collects five pages in all ten runs and retains fifty distinct incidents without state resets.

### Checklist
- [x] Follows project conventions; source functions remain under 40 lines
- [x] No hardcoded secrets or credentials; test credentials are explicit dummy values
- [x] No leftover debug statements
- [x] Local budget pauses have their own typed error and never enter the HTTP outage branch
- [x] Genuine HTTP 403/429/5xx failures still retain upstream delay headers and persisted backoff
- [x] Request quotas remain enforced before outbound fetch; per-run pauses stop subsequent queries and recovery scans
- [x] Checkpoints retain successful pages; repeated runs resume without dropped or duplicate incidents
- [x] Legacy quota-only cooldowns recover automatically; mixed real-failure records retain their cooldown
- [x] Concurrent local quota and upstream failure do not erase the real outage
- [x] Source success is recorded only for a validated source page; zero-request pauses preserve previous success/streak
- [x] GHSA token rejection remains visible if public fallback is blocked by a local budget
- [x] Shared pause-message classification keeps operational alerts consistent; real 429 still alerts
- [x] No code duplication introduced; warning/classification and health-finalization helpers are shared
- [x] Parameterized storage and existing validation/security boundaries preserved; no schema/API/UI changes
- [x] No additional dependencies, unresolved TODO/FIXME, or breaking changes
- [x] Tests cover happy path, error path, concurrency, rolling-window boundary, keyed/public limits, and persisted multi-run recovery

### Issues Found
1. Local NVD quota errors amplified outage backoff. Fixed by typed SourceBudgetError and run-local pause state. Local limits produce warnings and incomplete progress, without upstream errors, streak increments, or source cooldowns.
2. An upgraded build could inherit a six-hour quota-only cooldown. Fixed by clearing only health records whose errors are all known local budget messages; a real HTTP error prevents cleanup.
3. Existing source-success timestamps advanced on zero-request pauses. Fixed by recording lastSuccessAt only after a validated source page and resetting failure streak only when a source actually succeeded.
4. A GHSA token warning could be lost if fallback exhausted the run budget. Fixed by preserving warnings on the new budget error type.
5. Prior fairness verification deleted quota/health state between runs, hiding persisted escalation. Added tests that retain all state across hourly runs and verify normal/backfill progress, concurrency, alerts, and legacy recovery.

### Suggestions
1. Review and deploy the completed PR separately; this follow-up performs no production writes, deployment, merge, or notification delivery.
2. Production GITHUB_API_TOKEN rotation remains the existing operational follow-up.

### Manual scenario and verification
Before committing, ran the actual pipeline against SQLite with deterministic elapsed time and stubbed upstream responses: ten hourly public NVD runs, a second run at +10 seconds with an already-full quota, resume after +30.001 seconds, legacy six-hour cooldown, genuine Retry-After cooldown, and concurrent quota/503. Verify with `node node_modules/vitest/vitest.mjs run test/ingestion-quota.test.ts` on Node 24: twelve tests pass. Quota-only cases send no notification; the genuine 429 case records one mocked alert. Real HTTP 503 backoff remains covered by the existing regression suite. Full types/lint/build and coverage checks run before commit; CI is verified after push.

Final pre-commit verification: all 124 tests pass with coverage (81.44% overall lines; runtime 98.21%; network/storage/alerts 100%). Strict typecheck, ESLint, whitespace validation, and the Worker dry-run build pass. Personal review found no remaining issue in this change. Commit/push happen only after these results and this review were saved.

Post-push verification: fix commit 9679ad2 passed Windows PR CI run 38580845316, including clean install, typecheck, lint, all 124 tests with coverage, and Worker build: https://github.com/trungnt0308l/experiment/actions/runs/38580845316. No production deployment or merge performed.
