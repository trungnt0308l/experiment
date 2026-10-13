# Task: incident-ingestion-audit-oct13

## Meta
- **Status**: REVIEW
- **Branch**: chore/incident-ingestion-audit-oct13
- **PR**: Not created (diagnostic investigation)
- **Created**: 2026-10-13
- **Last Updated**: 2026-10-13

## Objective
Explain the low incident volume since May and the latest incident's August 18 incident date versus October 10 publication date using source, database, and code evidence.

## Plan
- [x] Read lessons, requirements, and earlier ingestion investigations; inspect repository status
- [x] Inspect source connectors, gates, cursors, scheduler, and date mapping
- [x] Inspect production ingestion telemetry and incident counts with read-only queries
- [x] Compare latest incident and missing candidates with upstream source records
- [x] Run existing tests and add diagnostic regression tests if needed
- [x] Verification
- [x] PR self-review and record findings

## Progress Log
- [2026-10-13] Started investigation in `D:/Working/cursor/experiment`; initial branch `main` was clean and matched the local `origin/main` reference. Read `.tasks/lessons.md`, root `PRD.md`, and previous March ingestion investigations.
- [2026-10-13] Attempted required `git pull origin main`; Git HTTPS authentication failed with `SEC_E_NO_CREDENTIALS`. Proceeding with local source and live read-only evidence; remote freshness will be checked with available alternatives.
- [2026-10-13] Recovered Git read access using `git -c http.sslBackend=openssl pull origin main`; remote main remains `cb7b70751d86985bc825d28d5dccde80b1c81b23` and the checkout is current. Created branch `chore/incident-ingestion-audit-oct13`.
- [2026-10-13] Traced date mapping and source connectors. NVD requests only the first six results for each of four keywords over a rolling 60-day publication window without pagination. GHSA requests only the newest forty advisories without pagination. Public incident dates map to the source publication date and Radar publication dates map to draft publication timestamps.
- [2026-10-13] Initial production query failed because the saved Cloudflare OAuth refresh token expired. User explicitly authorized Cloudflare access; started a fresh OAuth login with workspace-local credential storage and user confirmed completion. Production access remains read-only for this diagnostic task.
- [2026-10-13] Remote D1 confirms an operational cron: latest run at 13:00 UTC completed in 2.8 seconds, fetched 133 items, and reported `GitHub advisories failed: 401`. GHSA ingestion stopped on May 7. Since May 1 there are 53 ingested events, eight published incidents, and 45 medium-severity events without drafts.
- [2026-10-13] Confirmed the latest published incident is `CVE-2026-60758`: NVD source publication `2026-08-18T21:16:42.273`, first ingestion and publication both `2026-10-10T16:00:37.726Z`. Replayed NVD windows for October 9 and 10; the incident appears on page one only after an August 11 record falls outside the 60-day window.
- [2026-10-13] Live NVD pagination returned six page-two prompt-injection candidates, including critical Agno RCE `CVE-2026-37003`; all six are absent from remote D1. Identified additional connector constraints: GHSA fetches only forty advisories; EUVD supplies `datePublished` and `baseScore` but the connector does not map those fields; NVD/EUVD severity is inferred from text instead of upstream CVSS.
- [2026-10-13] Added two diagnostic tests for rejected GitHub authentication and repeated NVD first-page starvation. Baseline `npm.cmd test` fails five pre-existing February-fixture freshness tests at the current October date. Typecheck passes. Added an isolated verification clock/config to test all fixtures at their original calendar date without changing application behavior or the default suite.
- [2026-10-13] The first isolated-clock run exposed a test harness error: a frozen Date prevented runtime-budget checks from observing elapsed time. Replaced it with a shifted advancing clock and appended the lesson ledger.
- [2026-10-13] Verification completed: 71/71 tests pass with the task-specific advancing calendar, typecheck and audit script syntax checks pass, and raw V8 coverage was captured under ignored `.wrangler/audit-coverage`. Saved detailed findings and senior self-review. No application code, production database records, or product requirements were changed.

## Verification Checklist
- [x] Both requested explanations supported by direct evidence
- [x] Existing tests pass with isolated original-calendar verification (default suite has five pre-existing date-dependent failures)
- [x] No type errors (no lint script configured)
- [x] Manual production/source verification documented and executed
- [x] PRD updated if scope changed (not applicable: no product change)

## Issues / Blockers
- Git HTTPS using Schannel fails with `SEC_E_NO_CREDENTIALS`; OpenSSL successfully pulled current main.
- The default test command has five pre-existing date-dependent failures; all 71 tests pass with the isolated calendar setup.
- Cloudflare Worker version listing is denied. Production D1 access and source verification succeeded, so this does not block the diagnosis.
