## PR Review — incident-publishing-check-mar7

### Summary
Restore auto-publish after the March 7 regression by aligning the default confidence floor with the classifier's actual output range and making the value explicit in Wrangler config.

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
1. After deployment, backfill the three missed high-severity GHSA events ingested on March 10-11 if you want the public archive gap closed retroactively.
