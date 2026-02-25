## PR Review - ghsa-advisory-parsing-normalization-hotfix

### Summary
Adds a hotfix for oversized advisory summaries by introducing GHSA headline-first parsing, cross-source summary normalization/capping, render-time summary bounds, and an admin endpoint/UI action to normalize legacy long summaries.

### Checklist
- [x] Follows project style and conventions
- [x] No hardcoded secrets or credentials
- [x] No leftover console.log/print/debugger statements
- [x] Error handling is comprehensive
- [x] Edge cases handled
- [x] No code duplication - utilities extracted
- [x] DB queries efficient (no N+1)
- [x] API inputs validated and sanitized
- [x] UI accessible (aria, keyboard nav, contrast)
- [x] Responsive across breakpoints
- [x] Tests cover happy path + edge cases
- [x] No unresolved TODO/FIXME (or tracked in backlog)
- [x] Dependencies justified and up-to-date
- [x] Breaking changes documented

### Issues Found
1. None blocking after test/typecheck verification.

### Suggestions
1. After deployment, run /api/admin/ingestion/normalize-summaries once in production and verify the known GHSA incident URL + homepage sample card.
