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
