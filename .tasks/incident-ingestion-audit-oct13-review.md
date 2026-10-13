## PR Review — incident-ingestion-audit-oct13

### Summary

Documents the verified causes of low incident volume and delayed NVD discovery, adds two mocked diagnostic tests, and provides a repeatable read-only public audit script and isolated verification clock.

### Checklist

- [x] Follows project style and conventions
- [x] No hardcoded secrets or credentials; OAuth files and raw coverage remain ignored
- [x] No leftover debugger statements; audit script intentionally prints diagnostic results
- [x] Error handling covers failed source GETs and rejected authentication
- [x] Edge cases exercised: repeated polling, omitted second page, rejected token with completed cron
- [x] Uses existing test fixture helpers
- [x] Production SQL is SELECT-only and scoped to ingestion tables
- [x] API calls use fixed public endpoints and request timeouts
- [x] UI accessibility and responsiveness: no UI changes
- [x] Tests cover source failure and starvation; existing suite covers successful ingestion
- [x] Findings distinguish confirmed observations from historical inferences
- [x] No added dependencies
- [x] No breaking product changes

### Issues Found

1. Baseline fixtures age out in October. Retained the default suite unchanged and supplied an isolated advancing calendar for verification; default-suite limitation is documented.
2. The first verification clock froze elapsed time. Corrected the harness, recorded the lesson, and verified all 71 tests.
3. Wrangler and Vitest touched tracked local cache files under `node_modules`. Excluded these tool caches from the staged task changes.
4. CISA staleness is not enough to prove missing AI advisories. The findings explicitly distinguish this unproven limitation from verified GHSA failure and NVD omissions.

### Suggestions

1. Implement the six ordered remediation items in the findings as separate, reviewable changes. This task establishes the diagnosis without changing deployed behavior.
2. Replace calendar-dependent fixtures in a future test-maintenance task so the default suite stays reliable.
