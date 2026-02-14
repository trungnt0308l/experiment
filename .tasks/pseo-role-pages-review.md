## PR Review — pseo-role-pages

### Summary
Adds role-focused pSEO pages on the existing Worker stack: /for hub plus 24 role+problem spokes with strict quality gates, phased indexation flags, waitlist CTA attribution, and sitemap/indexing controls.

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
1. None blocking.

### Suggestions
1. Monitor index coverage and crawl behavior for /for/* before enabling PSEO_ROLE_PAGES_INDEXING_ENABLED=true in production.
