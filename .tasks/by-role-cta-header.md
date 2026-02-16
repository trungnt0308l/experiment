# Task: by-role-cta-header

## Meta
- **Status**: DONE
- **Branch**: fix/by-role-cta-header
- **PR**: (link once created)
- **Created**: 2026-02-16 18:27:59
- **Last Updated**: 2026-02-16 18:32:06

## Objective
Fix header/footer "By Role" CTA visibility so users do not see a broken link when role pages are disabled.

## Plan
- [x] Step 1 — Confirm current CTA wiring and feature-flag behavior
- [x] Step 2 — Update UI renderers to conditionally show "By Role" links
- [x] Step 3 — Pass role-page enabled flag from app routes into renderers
- [x] Step 4 — Add regression tests for hidden/shown CTA behavior
- [x] Step 5 — Verification
- [x] Step 6 — PR self-review

## Progress Log
- [2026-02-16 18:27:59] Started task. Checked out branch ix/by-role-cta-header.
- [2026-02-16 18:27:59] Confirmed /for routes are guarded by PSEO_ROLE_PAGES_ENABLED, while header/footer always render "By Role" links.
- [2026-02-16 18:32:06] Updated src/ui.ts to conditionally render header/footer role links via olePagesEnabled and threaded the flag through all page renderers.
- [2026-02-16 18:32:06] Updated src/app.ts route render calls to pass PSEO_ROLE_PAGES_ENABLED into UI renderers so CTA visibility matches route availability.
- [2026-02-16 18:32:06] Added regression assertions in 	est/app.test.ts for hidden CTA by default and visible CTA when role pages are enabled.
- [2026-02-16 18:32:06] Verification complete: 
pm run typecheck and 
pm run test passed.
- [2026-02-16 18:32:06] Manual verification: confirmed generated homepage HTML excludes href="/for">By Role by default and includes it when PSEO_ROLE_PAGES_ENABLED=true.
- [2026-02-16 18:32:06] Completed PR self-review checklist in .tasks/by-role-cta-header-review.md.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [x] Manual verification documented and executed
- [x] PRD updated if scope changed (not needed; no scope change)

## Issues / Blockers
(none)
