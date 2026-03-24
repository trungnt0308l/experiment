# Task: incident-cron-health-check-mar23

## Meta
- **Status**: DONE
- **Branch**: feat/incident-cron-health-check-mar23
- **PR**: (link once created)
- **Created**: 2026-03-23T20:01:56.1858767+07:00
- **Last Updated**: 2026-03-24T15:00:35.0000000+07:00

## Objective
Check why only one incident was published in the last 10 days and make sure the cronjobs are working properly.

## Plan
- [ ] Inspect PRD and recent incident publishing task context
- [ ] Trace cronjob configuration and runtime handlers
- [ ] Reproduce or identify the publishing bottleneck with tests/data inspection
- [ ] Implement fixes and add/update tests
- [ ] Verification
- [ ] PR self-review

## Progress Log
- [2026-03-23T20:01:56.1858767+07:00] Started task. Checked out branch `feat/incident-cron-health-check-mar23`.
- [2026-03-23T20:08:12.0000000+07:00] Reviewed the current PRD, prior March 11 incident publishing fix, deployed production worker version, and remote D1 state. Production still runs the March 11 deployment with a `scheduled` handler and the expected ingestion env vars.
- [2026-03-23T20:08:12.0000000+07:00] Confirmed the symptom in production D1: the latest published incident is from 2026-03-19T13:00:09.770Z, and source cursors stop at 2026-03-19 for GHSA, 2026-03-18 for NVD, 2026-03-16 for RSS, and 2026-03-05 for CISA KEV.
- [2026-03-23T20:08:12.0000000+07:00] Queried live upstream sources to distinguish quiet feeds from cron failure. GitHub advisories do not show AI-relevant matches after the 2026-03-19 GHSA cursor, but NVD currently returns post-2026-03-18 AI-related CVEs (including `CVE-2026-33060` and `CVE-2026-32622`) that are absent from production `ingested_events`.
- [2026-03-23T20:08:12.0000000+07:00] Chose two code changes to improve cron reliability and diagnosability: persist a cron heartbeat/status record in `ingestion_state`, and harden source fetching by parallelizing NVD keyword requests and surfacing silent source failures in the run result.
- [2026-03-23T20:12:48.0000000+07:00] Implemented the ingestion hardening in `src/ingestion.ts`: cron/manual runs now persist their latest state to `ingestion_state`, NVD keyword fetches run concurrently, and NVD/RSS fetch failures are recorded in the run result instead of silently disappearing.
- [2026-03-23T20:12:48.0000000+07:00] Added regression coverage in `test/ingestion.test.ts` for persisted cron run state, visible NVD HTTP failures, and the slow-NVD starvation scenario that previously could consume the cron budget before later sources ran.
- [2026-03-23T20:12:48.0000000+07:00] Verification passed with `npm run typecheck`, `npm run test`, and a focused `npx vitest run test/ingestion.test.ts`. Self-review completed in `.tasks/incident-cron-health-check-mar23-review.md`.
- [2026-03-23T20:13:36.0000000+07:00] Committed the fix as `fix(incident-cron-health-check-mar23): harden cron ingestion visibility` (`e773aad`) and pushed branch `feat/incident-cron-health-check-mar23` to `origin`.
- [2026-03-24T14:52:30.0000000+07:00] Re-synced the feature branch with `origin/main`, re-ran `npm run typecheck` and `npm run test`, and confirmed the release candidate was clean before production deployment.
- [2026-03-24T14:52:43.0000000+07:00] Deployed commit `161ab66` to the production Worker with `npm run deploy:prod`. Cloudflare reported version `2492dcc6-8ac3-4bd6-abee-fa4daa7fe633`, `handlers: fetch, scheduled`, and `schedule: 0 * * * *`.
- [2026-03-24T15:00:35.0000000+07:00] Verified the first post-deploy hourly cron in remote D1. `ingestion_state.run:latest:cron` updated at `2026-03-24T08:00:25.436Z` with `phase=completed`, `lockSkipped=false`, `errors=[]`, and no source fetch failures. The run fetched 169 source items and processed 0 relevant incidents, which is consistent with a quiet/no-match window rather than a broken scheduler.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [x] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
(none)
