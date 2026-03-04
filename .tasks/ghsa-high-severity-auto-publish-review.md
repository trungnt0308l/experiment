## PR Review — ghsa-high-severity-auto-publish

### Summary
Broadens auto-publish to high-severity incidents across all ingestion sources, adds GHSA source-severity normalization, and updates defaults/docs/tests accordingly.

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
1. None.

### Suggestions
1. Keep `AUTO_PUBLISH_TRUSTED_SOURCES` explicit in each environment to avoid accidental behavior drift if future sources are added.
