# Incident ingestion diagnosis — October 13, 2026

## Outcome

The production scheduler runs, but source coverage is degraded. GitHub advisories currently fail authentication, and NVD fetches only the oldest six results per keyword from a rolling 60-day window without pagination. The latest incident was discovered late and auto-published immediately.

This investigation used read-only production D1 queries and upstream GET requests. Application code, production settings, credentials used by the deployed Worker, and existing incident records were not changed.

## Production evidence

The latest persisted cron heartbeat (`ingestion_state`, `run:latest:cron`) started at `2026-10-13T13:00:50.117Z` and completed at `13:00:52.945Z`:

- `phase=completed`, `lockSkipped=false`, `stopReason=completed`.
- 133 source items fetched, zero new relevant items inserted.
- NVD fetched 24 items; zero were newer than the stored NVD cursor.
- GHSA fetched zero items and recorded `GitHub advisories failed: 401`.
- RSS fetched 25, CISA fetched 80, EUVD fetched four.

The heartbeat proves the scheduler currently operates; a completed run does not mean every source succeeded. Only the latest heartbeat is retained, so it cannot establish the first date on which GitHub started returning 401.

### Volume since May

Counts use ingestion/publication timestamps, not displayed incident dates.

| Month | Ingested | Published | Ingested without drafts |
| --- | ---: | ---: | ---: |
| May | 10 | 4 | 6 |
| June | 2 | 0 | 2 |
| July | 7 | 2 | 5 |
| August | 21 | 1 | 20 |
| September | 6 | 0 | 6 |
| October through October 13 | 7 | 1 | 6 |
| Total | 53 | 8 | 45 |

All eight high-severity ingestions since May have published. The other 45 are classified medium severity and have no drafts. The configured high-severity publication policy explains this difference, but does not explain the missing upstream incidents.

## Causes

### 1. GitHub advisory ingestion has stopped

GHSA contributed 366 of the database's 543 ingested events, but its latest ingestion and cursor update are `2026-05-07T01:00:39.126Z`. It contributed 232 events in February, 107 in March, 22 in April, five in May, and none thereafter.

Today's production run returns HTTP 401 for GitHub advisories. An unauthenticated GET to the same public API succeeds, so the deployed token is currently rejected. Expiration, revocation, or a malformed credential are possible; the exact cause and initial failure date cannot be distinguished with the retained latest-run telemetry.

The connector also retrieves only the newest 40 advisories without pagination or an upstream cursor filter. Today's 40 results span just `2026-10-09T20:44:54Z` to `20:57:50Z`; restoring authentication alone will not backfill the May–October gap.

Relevant code: `src/ingestion.ts`, `fetchGitHubAdvisoryEvents`, `prepareSourceQueue`, and `writeRunState`.

### 2. NVD first-page polling causes long discovery delays and missed incidents

`fetchNvdEvents` searches four terms over the last 60 days and sets `resultsPerPage=6`, but never sends `startIndex`, follows pagination, or uses the stored cursor in the API request. The API results are returned in ascending publication order. The cursor filters fetched records after retrieval; it cannot retrieve omitted pages.

On October 13 the live result totals were:

| Keyword | Available results | Fetched |
| --- | ---: | ---: |
| artificial intelligence | 8 | 6 |
| llm | 56 | 6 |
| prompt injection | 34 | 6 |
| machine learning | 17 | 6 |

Repeated runs retrieve the same first pages until older records leave the 60-day window. Many newer incidents remain unreachable. Some first-page records can also fall behind a cursor advanced by a different keyword search.

A read of page two of the prompt-injection query returned six records absent from production D1: `CVE-2026-75062`, `CVE-2026-18885`, `CVE-2026-37003`, `CVE-2026-74820`, `CVE-2026-82233`, and `CVE-2026-77956`. The Agno record `CVE-2026-37003` describes prompt-injection RCE and has an upstream CRITICAL rating. It is a concrete missed incident.

### 3. Severity classification further reduces publication

The auto-publish threshold is high severity. GHSA supplies source severity, but NVD and EUVD do not map upstream CVSS severity into `sourceSeverity`; they rely on a small list of text phrases. The high-severity list includes `rce`, but not the full phrase `remote code execution` or `arbitrary code execution`.

Consequently, real code-execution or high-CVSS advisories can be classified medium and remain ingestion-only. This is a classification limitation; publishing all medium items would change the product policy and is not required to repair collection.

### Additional coverage limitations

- HN is disabled in the checked-in production configuration; observed cron stats also show no HN fetches.
- The production RSS override contains only CERT/CC and CERT-EU security advisories, replacing the broader default feed list.
- EUVD's live schema contains `datePublished`, `dateUpdated`, and `baseScore`. The connector reads other date fields, leaving the seven existing EUVD source timestamps null; it does not map `baseScore`. The latest-vulnerabilities endpoint currently returns only four records, so the configured cap of 80 does not provide 80-record coverage.
- CISA's cursor has not advanced since March 5. Its current official repository feed orders newer records first: the first 80 span August 4–October 8. This audit did not establish a specific missing AI-relevant CISA item; the stale cursor alone does not prove scheduler failure.

## Latest incident: August 18 versus October 10

The latest published record is [CVE-2026-60758](https://nvd.nist.gov/vuln/detail/CVE-2026-60758), affecting Oracle Siebel Artificial Intelligence.

| Timestamp | UTC value | Meaning |
| --- | --- | --- |
| `ingested_events.published_at` | `2026-08-18T21:16:42.273` | NVD publication date |
| `ingested_events.created_at` | `2026-10-10T16:00:37.726Z` | First stored by Radar |
| `draft_posts.created_at` | `2026-10-10T16:00:37.726Z` | Published post created |
| `draft_posts.published_at` | `2026-10-10T16:00:37.726Z` | Published on Radar |

The elapsed discovery delay is about 52.8 days, or 53 calendar days. There was no post-ingestion approval delay: ingestion, draft creation, and publication use the same timestamp.

Replaying the connector's date windows against today's NVD dataset reproduces the transition:

- At an October 9 16:00 UTC end date, the first six artificial-intelligence results begin with `CVE-2026-72922`, published August 11 15:17 UTC. `CVE-2026-60758` is beyond page one.
- At an October 10 16:00 UTC end date, the August 11 record has aged outside the 60-day window. `CVE-2026-60758` becomes the sixth result. This matches its first ingestion in the next hourly cron at 16:00 UTC.

The replay is a reconstruction from the current upstream dataset, not retained historical HTTP logs. Together with the source code and exact database timestamps, it directly supports the first-page starvation explanation.

There is another example of the same pattern: Copilot `CVE-2025-66389` was published by NVD on June 22, but first ingested and immediately published on Radar on August 20, about 58.4 days later.

`toIncidentEntry` in `src/app.ts` labels the upstream publication date as “Incident date” and the draft publication timestamp as “Published.” The former is an advisory disclosure date, not a verified date of exploitation.

## Recommended remediation, in order

1. Restore valid GitHub API authentication; permit unauthenticated fallback for this public endpoint when authentication is rejected, and alert when a connector stops succeeding.
2. Add NVD pagination with durable progress and request ranges based on source cursors. Handle shared timestamps and newly updated older advisories without advancing past unprocessed pages.
3. Add GHSA pagination and a controlled backfill for the missing period. A single current first-page poll cannot recover months of advisories.
4. Map NVD/EUVD source severity and EUVD dates; review the 45 unpublished medium classifications before deciding whether any should publish.
5. Backfill missing incidents while preserving original source dates and accurately showing Radar's publication dates. Older GHSA items require an explicit backfill mode because the normal freshness gate rejects records older than 60 days.
6. Retain per-run/per-source success history and alert on persistent authentication errors, source staleness, and pagination backlog.

These are proposed repairs, not changes performed in this diagnostic task.

## Verification

- Production D1 queries returned `rows_written=0` and `changed_db=false`.
- The fresh public archive matches the reported August 18/October 10 dates.
- Live NVD data verifies the original publication date; its last modification is September 4, not October 10.
- Two added diagnostic tests reproduce rejected GitHub authentication and NVD first-page starvation.
- `npm.cmd run typecheck` passes; `node --check .tasks/incident-ingestion-audit-oct13-public.mjs` passes; `git diff --check` passes.
- Unmodified baseline `npm.cmd test` has five pre-existing failures because February fixtures exceed the 60-day age limit when run in October.
- With the isolated advancing-calendar setup, all 71 tests pass: `npm.cmd test -- --config .tasks/incident-ingestion-audit-oct13-vitest.config.ts --silent`. Raw V8 coverage was captured under ignored `.wrangler/audit-coverage`; no aggregate coverage percentage is claimed.
- No lint or build script exists. No PRD change is needed because product behavior was not changed.
- Worker version listing was denied by Cloudflare. Conclusions about live operation rely on production D1 telemetry and upstream/public reads rather than inspecting a deployment version.

Reproduce public checks: `node .tasks/incident-ingestion-audit-oct13-public.mjs`. Use normal Wrangler credentials for SELECT queries against `ingestion_state`, `ingested_events`, and `draft_posts`; do not run the ingestion trigger during a read-only audit.

## Follow-up robustness investigation

The user requested a broader reliability review after GitHub authorization. The branch was pushed successfully and the prioritized plan is in [the robustness review](incident-ingestion-audit-oct13-robustness.md).

The next production heartbeat at `2026-10-13T14:00:50.156Z` additionally reports four NVD HTTP 429 failures while still recording `phase=completed`, reinforcing the need for source-specific status and rate-limit cooldowns. Production contains 175 published incidents and ten high-severity ingestions without drafts; all ten predate March 4, so the audit does not attribute them to the newly reproduced failure paths.

Three new mocked tests reproduce cursor advancement past a failed event write, dropped records sharing a timestamp after a budget stop, and missing publication after a failed draft write. The expanded 74-test suite passes with the isolated advancing calendar; typecheck passes. These tests document existing defects and proposed repairs, not deployed fixes.
