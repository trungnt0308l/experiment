# Task: incident-ingestion-audit-oct13

## Meta
- **Status**: DONE
- **Branch**: chore/incident-ingestion-audit-oct13
- **PR**: https://github.com/trungnt0308l/experiment/pull/2
- **Created**: 2026-10-13
- **Last Updated**: 2026-10-13T21:44:16+07:00

## Objective
Explain the low incident volume and publication delay, then investigate and prioritize improvements to ingestion reliability, recovery, and operational visibility.

## Plan
- [x] Read lessons, requirements, and earlier ingestion investigations; inspect repository status
- [x] Inspect source connectors, gates, cursors, scheduler, and date mapping
- [x] Inspect production ingestion telemetry and incident counts with read-only queries
- [x] Compare latest incident and missing candidates with upstream source records
- [x] Run existing tests and add diagnostic regression tests if needed
- [x] Verification
- [x] PR self-review and record findings
- [x] Extend review to cursor correctness, retries, concurrent runs, source isolation, and operational visibility
- [x] Reproduce additional recovery defects and write a prioritized robustness plan
- [x] Verify expanded diagnostic tests and publish the review PR

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
- [2026-10-13] Committed findings, diagnostic tests, verification helpers, and lessons as `96ad13f`. Attempted `git -c http.sslBackend=openssl push -u origin chore/incident-ingestion-audit-oct13`; Git Credential Manager could not persist/retrieve credentials and non-interactive username prompting failed. The diagnostic objective is complete; publishing the branch/PR is blocked by GitHub authentication. Local tool cache changes under tracked `node_modules` remain excluded.
- [2026-10-13] User authorized GitHub device login. Authentication succeeded with workspace-local ignored credentials, branch push succeeded, and rebase onto current main completed without changing commits. User expanded the task to investigate how to make the system better and more robust; reopened this audit to add failure-path review, diagnostic coverage, and a prioritized implementation plan before creating the PR.
- [2026-10-13] Extended the review using the Workers skill, current Cloudflare documentation/types, source code, and SELECT-only production queries. Reproduced three additional recovery defects with mocked transient writes and timestamp ties. Follow-up heartbeat also reports NVD 429s; queried ten historical high-severity records without drafts and confirmed the archive currently holds 175 published entries.
- [2026-10-13] Wrote the robustness plan with evidence, priorities, durable D1 work processing, source cooldowns, shared leases, data quality/provenance, operational alerts, archive growth, and four implementation stages with acceptance tests. Expanded verification passes: 74/74 tests with the isolated advancing clock and TypeScript checking. No production settings, incidents, or application behavior were changed.
- [2026-10-13] Final expanded verification and self-review completed: 74 tests pass with raw V8 coverage collection; typecheck, audit syntax, and whitespace checks pass. Preparing the expanded investigation PR, including the previously completed production diagnosis and the new robustness plan.
- [2026-10-13T21:44:16+07:00] Committed the expanded review as `813a5c0`, pushed the branch, and opened PR #2: https://github.com/trungnt0308l/experiment/pull/2. Original diagnosis and expanded robustness investigation are complete; production repairs and reviewed backfill remain proposed work in the plan.

## Verification Checklist
- [x] Both requested explanations supported by direct evidence
- [x] Existing tests pass with isolated original-calendar verification (default suite has five pre-existing date-dependent failures)
- [x] No type errors (no lint script configured)
- [x] Manual production/source verification documented and executed
- [x] PRD updated if scope changed (not applicable: no product change)
- [x] Expanded robustness plan, diagnostic failure coverage, and review PR completed

## Issues / Blockers
- Git HTTPS using Schannel fails with `SEC_E_NO_CREDENTIALS`; OpenSSL successfully pulled current main.
- The default test command has five pre-existing date-dependent failures; all 71 tests pass with the isolated calendar setup.
- Cloudflare Worker version listing is denied. Production D1 access and source verification succeeded, so this does not block the diagnosis.
- Prior GitHub authentication blocker resolved: branch now exists on origin and GitHub CLI is authenticated via workspace-local ignored credentials.
