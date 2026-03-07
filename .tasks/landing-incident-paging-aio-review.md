## PR Review — landing-incident-paging-aio

### Summary
Implements landing-page conversion and discovery updates by removing the "Sample Alert" heading, linking sample incident cards to the live incident detail URL, adding three factual fear-based registration reasons, introducing SEO-friendly incident pagination routes (`/incidents/page/:n`), and adding structured data/FAQ content to improve AIO discoverability.

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
1. Consider adding a dedicated FAQ schema test in `test/ui-security.test.ts` if JSON-LD usage expands.

