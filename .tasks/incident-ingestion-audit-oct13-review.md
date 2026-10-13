## PR Review — incident-ingestion-audit-oct13

### Summary

Documents the causes of low incident volume and delayed discovery, adds five mocked diagnostic tests, and provides a read-only audit script, isolated verification clock, and prioritized reliability plan grounded in source/runtime failure paths.

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
- [x] Recovery findings distinguish mocked failure reproductions from actual production outcomes
- [x] Proposed repairs include validation criteria and a staged implementation sequence

### Issues Found

1. Baseline fixtures age out in October. Retained the default suite unchanged and supplied an isolated advancing calendar for verification; default-suite limitation is documented.
2. The first verification clock froze elapsed time. Corrected the harness, recorded the lesson, and verified all 71 tests.
3. Wrangler and Vitest touched tracked local cache files under `node_modules`. Excluded these tool caches from the staged task changes.
4. CISA staleness is not enough to prove missing AI advisories. The findings explicitly distinguish this unproven limitation from verified GHSA failure and NVD omissions.
5. Three additional data-loss paths were reproduced in existing application behavior. They are tracked in the robustness plan for implementation; this PR contains diagnostic tests and does not present itself as a production repair.
6. Follow-up production evidence shows NVD 429 failures and ten historical high-severity records without drafts. The plan covers rate-limit cooldowns and reviewed reconciliation without claiming a particular loss cause for the legacy records.

### Suggestions

1. Implement the four staged releases in the robustness review as separate, reviewable changes. This task establishes the diagnosis and acceptance criteria without changing deployed behavior.
2. Replace calendar-dependent fixtures in a future test-maintenance task so the default suite stays reliable.
