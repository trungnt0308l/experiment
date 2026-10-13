## PR Review — ingestion-reliability

### Summary
Replaces cursor-only collection with durable source inbox/checkpoints, retryable publication, paginated source windows, source metadata/CVSS normalization, rate-limit handling and owned leases. Adds authenticated recovery/health, optional alert and enrichment retries, public archive SQL paging/direct lookup, clearer date provenance, Windows CI and real D1 tests.

### Checklist
- [x] Follows project style and conventions; network, source, storage, run, enrichment and alert responsibilities separated
- [x] No hardcoded secrets or credentials; OAuth/test tooling and coverage stay ignored
- [x] No leftover debug statements; structured ingestion/alert logs are intentional operational telemetry
- [x] Error handling preserves durable work and uses fail-closed leases
- [x] Timestamp ties, changed payloads, duplicate CVEs, body stalls, rate limits and draft-write retries tested
- [x] Shared utilities extracted; no source persistence copy-paste
- [x] Parameterized D1 queries; public lists page in SQL, details use slug lookup, sitemap reads lightweight metadata
- [x] Recovery dates/sources authenticated and validated; source schemas/URLs bounded and checked
- [x] Recovery controls have labels, disabled/loading states and live feedback; all dynamic HTML escaped
- [x] Existing responsive layout preserved; no new unbounded visual components
- [x] Tests cover happy/error/boundary paths, real SQLite and Cloudflare D1
- [x] No unresolved TODO/FIXME introduced
- [x] Tool dependency updates justified; npm audit reports zero vulnerabilities
- [x] Node 24 requirement, optional enrichment behavior, additive migration and rollout/rollback documented

### Issues Found and Addressed
1. Source checkpoint could advance before write completion: inbox stages before query/page checkpoint; checkpoint-failure and feed-disappearance regressions added.
2. Retry could overwrite an editorial draft or claim it published: existing draft status/headline/timestamps preserved and item remains reviewable.
3. Windows parsed timezone-free EUVD dates locally: normalize explicitly to UTC; fixture checks exact upstream format.
4. Token fallback repeated on every GHSA page: use copied per-run bindings to switch subsequent pages to public access, retaining an operator warning.
5. Historical recovery could starve current collection: process pending work and current sources first, then recovery in remaining budget.
6. Optional LLM failure could suppress publication: independent bounded enrichment with persisted cooldown, publication remains available.
7. Semantic matching made model availability an ingestion dependency: stable source/CVE/URL identity is the deterministic gate; decision documented in PRD.
8. Host tooling initially wrote outside workspace: use workspace-local XDG config/logs and isolated local D1 persistence.
9. Live GitHub preview rejected full timestamp ranges despite mocks accepting them: switched to inclusive UTC calendar-date ranges and explicit reviewed advisory filtering, and added a contract regression.
10. Reset would leave completed durable work behind: explicit reset now atomically clears inbox/checkpoints under the owned ingestion lease; no production reset was executed.
11. Live full-description preview exposed non-AI vulnerabilities discovered using AI tooling: exclude incidental discovery/acknowledgement text from classification while retaining source evidence; verified affected AI products still qualify. Explicitly exclude withdrawn GitHub advisories from new collection.
12. Post-rollout quota review caught shared normal/backfill keyword rotation potentially starving alternating historical queries: use independent job-specific rotations and test all four queries with only one remaining request per run. Source errors explicitly mark scan incomplete.

### Verification
- Windows Node 24.21.0; typecheck, ESLint and tests pass; Worker deployed successfully. Final verification includes 99 tests and the independent rotation/intentional-quota alert regressions.
- Latest coverage before the alert regression: 80.38% lines overall; new durable runtime 97.87%, storage/network/alerts/enrichment 100% lines.
- Real D1 simulator: all migrations, competing leases, owned release, idempotent stage/draft writes pass.
- Local browser: labelled health/recovery controls, stale-heartbeat warning, recovery disabled until preview, script compilation pass. Only favicon 404 noted; no application console errors.
- Production version/bindings inspected; only additive migration 0007 pending; rollback version/bookmark recorded in task file.
- Live first-page recovery preview passed: 376 fetched, 260 unique matching candidates, 169 source-high. Candidates include existing records; preview is not a gap count or publication guarantee.
- Production migration/deployment/smoke checks pass; initial recovery published 21 additional pages and retained 249 pending records for scheduled continuation. Recovery is ongoing. Operator notifications and the next actual scheduler invocation have not yet been observed in production; unit/integration checks cover those paths. Intentional local quota pauses do not send outage alerts.

### Suggestions / Follow-up
1. Configure independent authenticated heartbeat monitoring; an absent scheduler cannot self-alert.
2. Rotate the rejected GHSA source token and add an NVD key through the secret manager; fallback/quota protection work without them.
3. EUVD/RSS/latest snapshots cannot recover arbitrarily old history; NVD/GHSA are the explicit historical recovery sources.
4. Split the sitemap into an index before growth reaches its documented 45,000-incident protocol budget; archive/detail queries are not capped by this sitemap limit.
