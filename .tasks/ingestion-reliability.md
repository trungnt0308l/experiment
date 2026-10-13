# Task: ingestion-reliability

## Meta
- **Status**: REVIEW
- **Branch**: fix/ingestion-reliability
- **PR**: https://github.com/trungnt0308l/experiment/pull/3
- **Created**: 2026-10-13T21:50:33+07:00
- **Last Updated**: 2026-10-13T21:50:33+07:00

## Objective
Implement the approved ingestion robustness plan: complete collection, recoverable work, authoritative source metadata, archive access, operational health/alerts, verification, and controlled recovery of the incident gap.

## Plan
- [x] Read lessons, requirements, and the approved investigation; sync main and create implementation branch
- [x] Implement durable ingestion work, owned shared leases, safe checkpoints, and recoverable publication
- [x] Implement paginated source scans, bounded network calls, authentication fallback, cooldowns, schema/date/CVSS mapping
- [x] Implement database-backed archive paging and detail lookup, accurate disclosure dates, operational health and alerts
- [x] Add deterministic regression, integration, and recovery tests; CI and coverage
- [x] Verify behavior and prepare a reviewed backfill preview
- [x] Update requirements/docs and perform PR self-review
- [ ] Commit, push, create PR, and carry out authorized production rollout/recovery where access permits

## Progress Log
- [2026-10-13T21:50:33+07:00] User requested implementation of the completed robustness plan. Read lessons, PRD, audit context, and implementation recommendations. Main remains `cb7b707`; prior audit is retained on its own branch/PR. Existing tracked Vitest cache changes are preserved and excluded from task commits.
- [2026-10-13] Added migration 0007, durable source work, shared owned leases, retryable processing, stable source identity and canonical CVE matching. Added paginated NVD/GHSA scanning, public-auth fallback, response-body deadlines, rate-limit cooldowns, EUVD date/CVSS mapping, source/run history, and backfill preview/resume APIs.
- [2026-10-13] Replaced fragile SQL string mocks for ingestion/archive tests with a real SQLite adapter. The default test command now uses a deterministic advancing clock and passes the original 69 tests. Added recovery regressions; Windows timezone testing exposed a source date normalization issue, which was corrected and logged in lessons.
- [2026-10-13] User clarified that the host is Windows. Local tooling uses PowerShell and native Windows commands; CI now targets windows-latest with Node 24. Updating vulnerable runtime/test/tool dependencies with compatible Workers types; tracked node_modules changes remain excluded from commits.
- [2026-10-13] Verified using a SHA-256-checked Windows Node 24 binary in ignored workspace tooling: typecheck, ESLint, Worker dry-run build, and 91 tests passed. Added real Cloudflare D1 migration/lease/draft integration coverage, archive access beyond 200 records, authenticated read-only recovery previews, alert deduplication/retry tests, preserved editorial decisions, and separate optional enrichment retries. Dependency audit reports zero known vulnerabilities.
- [2026-10-13] Production Worker versions remain inaccessible with existing OAuth. Requested the additional `workers_scripts:write` scope using Wrangler login; the browser authorization request timed out before a callback. No production database migration, deployment, or backfill has been performed.
- [2026-10-13T23:03+07:00] User completed the fresh authorization. Worker-script access now works; recorded rollback version `2492dcc6-8ac3-4bd6-abee-fa4daa7fe633` and pre-rollout D1 bookmark `000073cc-00000000-00005103-e59da5db13b35cad5be11b23b25a710a`. Production has only migration 0007 outstanding, and existing operator notification secret names are configured. Browser health/recovery controls passed against a separate local D1 database. Latest checks: 93 tests, types, lint, and dry-run build pass.
- [2026-10-13T23:11+07:00] Live read-only preview caught GitHub's timestamp-range rejection; corrected calendar-date query contract, explicit reviewed/non-withdrawn filtering, and incidental AI-tooling discovery classification. Successful preview: 376 fetched records, 260 unique matching candidates (7 GHSA, 253 NVD), including 169 source-high candidates. This is a first-page sample and includes existing records, not a missing/new publication count. Final tests now 97 passed; lint/types pass. Added reset lease/atomic durable cleanup and a recovery-stop endpoint. Updated PRD/README and completed senior self-review.
- [2026-10-13T23:14+07:00] Applied additive migration 0007 to production and deployed Worker version `7926f847-63da-4b58-8ff6-cf167bc2a8a1` from implementation commit `3ce14d4`. All seven existing secret names retained and hourly trigger unchanged. Public smoke checks passed: homepage, admin controls, archive page 18, old detail URL, sitemap, and unauthorized health 401. Latest known incident keeps source Aug 18 and original Radar Oct 10; JSON-LD now uses Oct 10 Radar publication.
- [2026-10-13T23:15+07:00] Started the reviewed May 1–Oct 13 recovery using the same compiled pipeline and an authenticated parameterized D1 operator adapter (no admin secret read or changed). Initial bounded run fetched 779 records, inserted 33 incidents and published 21; 249 durable records remain queued with no processing failures/retries. Source quota/runtime stops are explicit and resumable. Production counts increased from 543 events/175 pages to 576 events/196 pages. Recovery is enabled for scheduled continuation; it is NOT complete. No old pre-May orphan was blindly published. PR #3 created; both Windows push/PR CI jobs passed at code commit `3ce14d4`.
- [2026-10-13T23:19+07:00] Reviewed constrained recovery progress and isolated NVD keyword rotation per job to prevent starvation with one remaining request. Added regression across four runs. Intentional local quota pauses remain visible in health but do not trigger outage notification noise; real HTTP errors, rejected tokens, stale heartbeats and aged backlog still alert.

## Verification Checklist
- [x] Pagination catches current and historical advisories without dropping timestamp ties
- [x] Failed writes/publication retry without duplicate incidents
- [x] All triggers share owned leases; source cooldowns and body deadlines are enforced
- [x] Upstream severity/date metadata and original publication dates are preserved
- [x] Archive and detail pages retain access beyond 200 records
- [x] Source failures, backlog, and stale runs are visible and alertable
- [x] Full deterministic tests, typecheck, lint, build, integration, and coverage checks pass
- [x] Backfill preview/recovery results and production constraints documented
- [x] PRD/docs updated and self-review completed

## Issues / Blockers
- Implementation is deployed and recovery is running, not finished. Next normal hourly execution after the initial run is 2026-10-13T17:00Z. Existing GHSA source token still needs rotation; public fallback is implemented. An independent authenticated heartbeat monitor is not configured by this task. Operator alert delivery and the next actual scheduler invocation are not yet observed in production. Normal safety/source limits remain enabled.
