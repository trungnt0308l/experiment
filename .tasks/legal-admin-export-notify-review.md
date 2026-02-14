## PR Review — legal-admin-export-notify

### Summary
Adds operational trust and lead-ops capabilities by implementing legal pages, token-protected admin exports, and instant lead notifications for newly joined signups.

### Checklist
- [x] Follows project style and conventions
- [x] No hardcoded secrets or credentials
- [x] No leftover console.log/print/debugger statements
- [x] Error handling is comprehensive
- [x] Edge cases handled
- [x] No code duplication — utilities extracted
- [x] DB queries efficient (no N+1)
- [x] API inputs validated and sanitized
- [x] UI accessible (aria, keyboard nav, contrast)
- [x] Responsive across breakpoints
- [x] Tests cover happy path + edge cases
- [x] No unresolved TODO/FIXME (or tracked in backlog)
- [x] Dependencies justified and up-to-date
- [x] Breaking changes documented

### Issues Found
1. Placeholder legal policy content is intentionally generic and should be finalized before broad paid acquisition.

### Suggestions
1. Store sensitive notification keys as Wrangler secrets (not plain vars) in production.