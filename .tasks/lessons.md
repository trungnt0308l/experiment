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
