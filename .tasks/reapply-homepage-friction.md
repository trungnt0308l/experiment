# Task: reapply-homepage-friction

## Meta
- **Status**: REVIEW
- **Branch**: fix/reapply-homepage-friction
- **PR**: (link once created)
- **Created**: 2026-02-25 23:52:01 +07:00
- **Last Updated**: 2026-02-25 23:54:37 +07:00

## Objective
Reapply homepage friction removal by deleting risk checkboxes and allowing email-only waitlist signup.

## Plan
- [x] Remove risk checkbox UI and client-side risk validation from homepage form
- [x] Make waitlist interests optional/blank-safe in backend validation and notifications
- [x] Update tests for homepage and waitlist behavior
- [x] Step 4 - Verification
- [x] Step 5 - PR self-review

## Progress Log
- [2026-02-25 23:52:01 +07:00] Started task on branch ix/reapply-homepage-friction.
- [2026-02-25 23:52:01 +07:00] Completed startup checks: read .tasks/lessons.md, read PRD, checked git status, rebased onto main.
- [2026-02-25 23:54:37 +07:00] Updated src/ui.ts to remove risk checkbox UI and risk-selection gating logic, preserving email-first submit flow.
- [2026-02-25 23:54:37 +07:00] Updated src/app.ts schema to make interests optional and normalized notification text to (not provided) when interests are empty.
- [2026-02-25 23:54:37 +07:00] Updated 	est/app.test.ts to assert no iskOption markup and to cover valid signup without interests.
- [2026-02-25 23:54:37 +07:00] Ran verification commands: 
pm run typecheck and 
pm run test (pass).
- [2026-02-25 23:54:37 +07:00] Updated PRD.md changelog for friction-removal behavior restoration.
- [2026-02-25 23:54:37 +07:00] Completed PR self-review in .tasks/reapply-homepage-friction-review.md.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [ ] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
(none)
