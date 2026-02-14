## PR Review — cron-cpu-time-fix

### Summary
Adds CPU-budget protection to ingestion by splitting scheduled source execution into alternating cron batches and applying a hard per-run processed-event cap.

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
1. Monitor cron output for a few cycles and tune INGESTION_MAX_EVENTS_PER_RUN based on observed run cap hit frequency.
