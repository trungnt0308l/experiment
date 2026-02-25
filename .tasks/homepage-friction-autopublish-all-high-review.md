## PR Review — homepage-friction-autopublish-all-high

### Summary
Implements three coordinated updates: removes homepage risk-checkbox friction with optional `interests`, adds a targeted homepage messaging revamp with cited cost-of-delay facts, and expands auto-publish to high-severity incidents across all sources with a one-time 60-day admin backfill endpoint and UI action.

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
1. None blocking after typecheck and test pass.

### Suggestions
1. After deployment, run a production backfill from `/admin/ops` and monitor draft volume before enabling frequent manual use.
2. Consider adding an integration test with a D1 test double for backfill row selection/count integrity.
