## [2026-02-14] ai-security-radar-phase0-bootstrap: Missing strict type deps in initial scaffold
- **What went wrong**: Typecheck failed after scaffold because @cloudflare/workers-types was not installed and JSON response handling in tests used unknown types.
- **Root cause**: Initial bootstrap focused on runtime speed and skipped strict TypeScript validation details.
- **Fix applied**: Added @cloudflare/workers-types dev dependency and explicit response body typing in tests.
- **Rule going forward**: After scaffolding any TypeScript project, run 
pm run typecheck immediately before writing more features.
