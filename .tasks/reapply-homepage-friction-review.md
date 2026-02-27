## PR Review - reapply-homepage-friction

### Summary
Restores the low-friction homepage waitlist flow by removing risk checkboxes and client-side risk gating, making `interests` optional in backend validation, and keeping notifications readable with an explicit `(not provided)` fallback.

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
1. None.

### Suggestions
1. Keep a homepage regression assertion for absence of `riskOption` in future UI changes to prevent reintroduction.
