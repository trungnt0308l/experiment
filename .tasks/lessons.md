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

## [2026-02-14] cron-cpu-time-fix: Cloudflare cron trigger plan limit blocked deploy
- **What went wrong**: Production deploy failed when setting 6 cron expressions for per-source scheduling.
- **Root cause**: Account plan supports a maximum of 5 cron triggers per Worker.
- **Fix applied**: Reduced to 5 cron triggers and mapped HN into the `40 * * * *` slot when enabled.
- **Rule going forward**: Check Cloudflare account/platform limits before expanding schedule fan-out; design cron routing to fit hard trigger caps.
