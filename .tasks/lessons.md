## [2026-02-14] ai-security-radar-phase0-bootstrap: Missing strict type deps in initial scaffold
- **What went wrong**: Typecheck failed after scaffold because @cloudflare/workers-types was not installed and JSON response handling in tests used unknown types.
- **Root cause**: Initial bootstrap focused on runtime speed and skipped strict TypeScript validation details.
- **Fix applied**: Added @cloudflare/workers-types dev dependency and explicit response body typing in tests.
- **Rule going forward**: After scaffolding any TypeScript project, run 
pm run typecheck immediately before writing more features.
## [2026-02-14] legal-admin-export-notify: Worker execution context assumptions broke tests
- **What went wrong**: Tests failed with 500 because c.executionCtx getter throws outside real worker runtime.
- **Root cause**: Code assumed execution context exists in all environments.
- **Fix applied**: Added unBackground() helper that safely accesses execution context and falls back to awaited execution.
- **Rule going forward**: Never directly access c.executionCtx in handlers without try/catch fallback for test/runtime compatibility.
## [2026-02-14] secret-hygiene-cleanup: Secret-like config committed in tracked files
- **What went wrong**: Token/key placeholders and secret setup guidance were placed in wrangler.toml and repo docs in a way that encouraged storing secrets in git.
- **Root cause**: Fast implementation path prioritized operability over strict secret-management boundaries.
- **Fix applied**: Removed secret-like vars from tracked Wrangler config, switched setup docs to wrangler secret put, and added .dev.vars.example with .gitignore protection.
- **Rule going forward**: Never store secrets in tracked files; always use environment secret managers and local ignored files for development.

## [2026-02-14] phase1-ingestion-pipeline: Strict union type regression in RSS parser
- **What went wrong**: Typecheck failed because a fallback branch returned an object with a broad string literal for source instead of the SourceEvent union.
- **Root cause**: Added defensive fallback data that did not preserve strict event typing constraints.
- **Fix applied**: Removed the invalid fallback branch and returned only correctly typed parsed items.
- **Rule going forward**: For strict unions, avoid synthetic fallback objects unless they conform exactly to the declared type.


## [2026-02-14] p0-p1-sources-and-seo: Strict union filtering regression in new connectors
- **What went wrong**: Typecheck failed after adding new source connectors because map(...).filter(...) returned nullable arrays that were not narrowed correctly.
- **Root cause**: Type predicates used a broad union target incompatible with the mapped literal subtype.
- **Fix applied**: Added a generic isPresent helper and used .filter(isPresent) for all nullable connector maps.
- **Rule going forward**: For strict unions in TypeScript, use shared generic null guards for mapped arrays instead of ad-hoc source-specific predicates.

## [2026-02-14] ingestion-resource-limit-fix: Unbounded subrequest fan-out in ingestion
- **What went wrong**: Manual ingestion route exceeded Cloudflare Worker resource limits and returned HTML 503 pages to admin UI.
- **Root cause**: HN item fetches plus multi-source connectors plus LLM dedupe/enrichment calls were not capped per run.
- **Fix applied**: Added runtime caps (HN_MAX_ITEMS, LLM_DEDUPE_MAX_CALLS, LLM_ENRICH_MAX_CALLS) and reduced safe defaults.
- **Rule going forward**: For Worker cron/manual pipelines, budget total outbound requests first and enforce hard per-run call caps in code and env defaults.

## [2026-02-14] post-ingestion-clarity-fixes: Unsafe HTML rendering from ingested fields
- **What went wrong**: Incident rendering used raw ingested strings in HTML, allowing markup/script tags to break page structure and open XSS risk.
- **Root cause**: UI templates interpolated untrusted data without escaping/sanitization or URL normalization.
- **Fix applied**: Added safe text rendering, dangerous tag stripping, URL sanitization, and relative URL resolution for image/link sources.
- **Rule going forward**: Treat all ingested/generated content as untrusted and pass it through explicit escaping/sanitization before rendering.

## [2026-02-14] admin-sanitize-and-publish-rewrite: Admin UI injected raw ingestion strings into innerHTML
- **What went wrong**: Admin ingestion/draft cards rendered untrusted DB fields directly into innerHTML, so embedded tags/scripts could break the page.
- **Root cause**: Browser-side template rendering skipped explicit escaping and URL sanitization.
- **Fix applied**: Added client-side HTML escaping and URL validation helpers for all dynamic admin card fields; kept links constrained to http/https.
- **Rule going forward**: Any dynamic content rendered with innerHTML must pass explicit escape/sanitize helpers first, even in admin-only UI.

## [2026-02-14] admin-ingestion-ux-and-rewrite-quality: Raw long summaries degraded operator UX
- **What went wrong**: Admin ingestion cards rendered full source content inline, consuming excessive screen space and making review inefficient.
- **Root cause**: UI lacked summary preview/truncation for high-verbosity source entries.
- **Fix applied**: Added preview truncation and optional details expansion for full content; preserved access without overwhelming layout.
- **Rule going forward**: Any operational review list should default to compact previews with explicit expand controls for verbose fields.

## [2026-02-28] cron-resource-hardening: Runtime cap floor mismatch with intended budget controls
- **What went wrong**: New cron budget tests failed because hard minimum clamp values prevented low explicit budget settings from taking effect.
- **Root cause**: I introduced conservative lower bounds without reconciling them with required strict-mode behavior and test scenarios.
- **Fix applied**: Reduced cron clamp minimums for runtime/process/write budgets, then updated assertions and re-ran full typecheck/tests.
- **Rule going forward**: When adding budget clamps, validate that minimums still permit operational/debug configurations and include tests that exercise those boundary values.

## [2026-03-07] seo-content-enhancement-plan: Shared UI type hardening broke test fixtures
- **What went wrong**: Typecheck failed after tightening the shared `IncidentEntry` shape because an existing UI test fixture no longer satisfied the now-required `sortDate` field.
- **Root cause**: I changed a shared type used by both app code and isolated rendering tests without updating the dependent fixture at the same time.
- **Fix applied**: Added the missing field to the UI security fixture and re-ran `npm run typecheck` plus the full test suite.
- **Rule going forward**: When strengthening shared TypeScript types, immediately search all tests and helper fixtures that instantiate that type before running verification.

## [2026-03-11] incident-publishing-check-mar7: Exact float assertion broke score regression test
- **What went wrong**: A new ingestion regression test compared a computed relevance score with `toBe(0.45)` and failed because the weighted score resolved to `0.45000000000000007`.
- **Root cause**: I used exact equality for a floating-point calculation instead of a tolerance-based assertion.
- **Fix applied**: Switched the test to `toBeCloseTo(0.45, 5)` and re-ran the suite.
- **Rule going forward**: Any test that checks weighted or derived floating-point scores must use tolerance assertions rather than exact equality.

## [2026-03-23] incident-cron-health-check-mar23: Duplicate payload keys slipped through before final typecheck
- **What went wrong**: `npm run typecheck` failed after the ingestion telemetry change because the new run-state payload objects specified `mode` twice, once explicitly and once through a spread object.
- **Root cause**: I added the run-state JSON shape quickly and did not check for overlapping keys in the spread payload.
- **Fix applied**: Removed the duplicate explicit `mode` fields and re-ran `npm run typecheck` plus the full test suite.
- **Rule going forward**: When building typed telemetry/state payloads with object spreads, scan for overlapping keys before leaving the edit phase.

## [2026-10-13] ingestion-reliability: Date parsing depended on the Windows timezone
- **What went wrong**: The real EUVD date-format regression test differed by seven hours on this Windows machine. Initial typecheck also exposed a union-valued HTTP header object and missing explicit Node test types after toolchain updates.
- **Root cause**: Upstream date strings omitted timezone information, so Date.parse used the host timezone; inferred optional header values and transitive ambient test types were insufficiently explicit.
- **Fix applied**: Normalize timezone-free source dates as UTC, explicitly type HTTP headers, include Node test types, and add real SQLite regression tests. Windows CI uses Node 24.
- **Rule going forward**: Normalize source dates with an explicit timezone before storing or comparing them, and validate tests on the actual supported OS/runtime rather than relying on implicit ambient types.

## [2026-10-13] ingestion-reliability: Simulator and timing assumptions after dependency upgrades
- **What went wrong**: The first D1 simulator test used the older constructor shape against Miniflare 5; a 60ms concurrency fixture became flaky with real SQLite persistence. An old test also expected all four requests to continue after rate limiting.
- **Root cause**: Test assumptions depended on old tool APIs, mocked persistence speed, and the previous retry behavior.
- **Fix applied**: Use the simulator's documented v4 configuration adapter, give concurrency verification adequate runtime headroom, and assert that a known cooldown stops remaining source calls.
- **Rule going forward**: Read installed tool types after major upgrades; test timing invariants without razor-thin wall-clock margins, and update regression expectations only when the intended behavior changes.

## [2026-10-13] ingestion-reliability: Live source contract verification catches mocked API acceptance
- **What went wrong**: The live read-only GitHub recovery preview rejected timestamp ranges with HTTP 422, although unit fetch mocks accepted them.
- **Root cause**: GitHub advisory date filters accept calendar-date search ranges, not these millisecond timestamp ranges; reviewed-advisory selection also needs to be explicit.
- **Fix applied**: Use inclusive UTC YYYY-MM-DD ranges with durable ID deduplication, explicitly request reviewed advisories, add a request-contract regression, and repeat the live preview before rollout.
- **Rule going forward**: Verify representative source URLs against live read-only APIs before deploying connector changes; mocks must assert request contracts, not only response handling.

## [2026-10-13] ingestion-reliability: Shared scheduling cursor can starve recovery
- **What went wrong**: Review of the first recovery quota stop found that incrementing one rotation cursor for both normal and historical scans could repeatedly give the sole remaining request to alternating keywords.
- **Root cause**: Two consumers advanced the same four-query rotation, producing a two-step cycle instead of fair independent progression.
- **Fix applied**: Keep job-specific historical rotation independent of normal scans; a four-run regression proves every historical keyword receives a request under a one-request remainder.
- **Rule going forward**: Separate fairness cursors across competing workloads and test constrained-budget progress across multiple runs, not just a single successful scan.

## [2026-10-14] ingestion-followup: Review exposed source record and budget gaps
- **What went wrong**: PR review found a stable oversized advisory could block its page, the GHSA cap was not consumed, and the diagnostic audit launched unpaced public NVD requests.
- **Root cause**: Storage validation failed at page scope; the runtime replaced connectors without carrying every resolved cap forward; the audit eagerly created fetch promises.
- **Fix applied**: Bound metadata and quarantine oversized core content, retain original change hashes, enforce a shared GHSA cap with partial-page checkpoints, and queue/pause/retry audit requests with a failing exit status on incomplete evidence.
- **Rule going forward**: Test poison records followed by valid pages; trace every advertised cap to runtime consumption; diagnostic scripts must follow the same source limits and fail clearly when evidence is incomplete.

## [2026-10-14] ingestion-followup: Parameterized fixture widened tuple values
- **What went wrong**: The new cap boundary test passed at runtime but typecheck inferred each array element as string | number, conflicting with the string environment binding.
- **Root cause**: A mixed-type parameter table lacked tuple inference.
- **Fix applied**: Use a const assertion on the parameter table and repeat typecheck and lint.
- **Rule going forward**: Preserve tuple types for mixed-type parameter tables; runtime test success does not replace strict typechecking.

## [2026-10-14] ingestion-followup: JavaScript tests lacked shared lint globals
- **What went wrong**: ESLint rejected Response in the new JavaScript audit tests although the runtime tests passed.
- **Root cause**: The existing test lint configuration applied runtime globals only to TypeScript files.
- **Fix applied**: Extend the test glob to cover JavaScript tests using the same runtime globals.
- **Rule going forward**: When adding a test file type, include it in the repository lint configuration and check it before handoff.

## [2026-10-14] ingestion-followup: Recreated fixtures changed disclosure timestamps
- **What went wrong**: Windows CI caught the metadata hash regression comparing retained payloads with publication timestamps two milliseconds apart, although the local run happened within one clock tick.
- **Root cause**: The advancing-calendar fixture factory was invoked twice when the test intended to vary metadata alone.
- **Fix applied**: Reuse one source event and vary only its metadata; repeat full local verification and Windows CI.
- **Rule going forward**: When proving one field changes, create the baseline fixture once and keep all other fields identical; never rely on multiple clock reads having the same timestamp.

## [2026-10-14] ingestion-followup: Raw OAuth requests bypassed automatic token refresh
- **What went wrong**: A saved access token returned 401 and was initially treated as needing a new Cloudflare login.
- **Root cause**: The raw API operator script did not use the valid refresh token through Wrangler's OAuth lifecycle.
- **Fix applied**: Copy the ignored profile to writable workspace storage, run Wrangler whoami to refresh automatically, and verify production D1 reads and Worker version access.
- **Rule going forward**: Check authenticated access through the provider's CLI before declaring an expired access token to be an access blocker.

## [2026-10-14] ingestion-followup: Expected quota pauses amplified outage backoff
- **What went wrong**: The P1 on PR #4 correctly found that my exponential backoff counted locally generated NVD quota errors as upstream outages. A deterministic ten-hour reproduction collected zero pages in three scheduled runs.
- **Root cause**: Local quota enforcement reused SourceHttpError(429); the prior fairness test deleted quota/health state, so it could not detect accumulated cooldowns across runs.
- **Fix applied**: Add a distinct typed budget pause, keep pauses within a run, classify them as warnings, preserve rolling quotas/checkpoints, and recover legacy quota-only cooldowns. Add repeated hourly/rolling-window/recovery tests without deleting state, plus real 429/503 and mixed-history checks. Source success requires an actual successful response; GHSA token warnings survive budget-limited fallback.
- **Rule going forward**: Never encode an intentional local scheduling limit as an upstream HTTP failure. Test repeated runs with persisted state intact and verify genuine upstream failures still back off and alert before committing.
