## PR Review — seo-content-enhancement-plan

### Summary
Implements stricter AI relevance and auto-publish quality gates, expands public SEO content on the landing and incident pages, adds a methodology/editorial page, and excludes weak incident pages from sitemap/listing visibility while keeping direct access available.

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
1. Shared `IncidentEntry` typing initially caused a strict type mismatch in tests after making `sortDate` required. The fixture was updated and the shared type was kept strict because public incident entries are always expected to carry a sortable date.

### Suggestions
1. Follow up with a one-time content audit against current production incidents so weak legacy pages can be republished, removed, or deliberately left `noindex` based on actual Search Console feedback.
