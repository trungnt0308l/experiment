## PR Review — by-role-cta-header

### Summary
Conditionally hides header/footer "By Role" CTA when role pages are disabled and shows it when PSEO_ROLE_PAGES_ENABLED=true, preventing a broken /for link in default environments.

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
1. If desired later, extend the same flag-aware nav behavior to any future shared shell components to prevent route-flag mismatches.

### Review Date
- 2026-02-16
