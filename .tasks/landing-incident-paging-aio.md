# Task: landing-incident-paging-aio

## Meta
- **Status**: DONE
- **Branch**: feat/landing-incident-paging-aio
- **PR**: (link once created)
- **Created**: 2026-02-27T22:05:37.9790335+07:00
- **Last Updated**: 2026-02-27T22:14:01.6079140+07:00

## Objective
Update landing and incidents UX/SEO: remove “Sample Alert” heading, point sample to live incident URL, add 3 factual fear-driven register reasons, add SEO-friendly pagination, and strengthen AIO discoverability.

## Plan
- [x] Inspect existing landing/incidents rendering and route behavior
- [x] Implement landing sample-link and 3 factual registration reasons
- [x] Implement incidents pagination with SEO-friendly URLs and meta linking
- [x] Add AIO-friendly structured data/content signals
- [x] Write/update tests
- [x] Verification (tests + typecheck + manual checks)
- [x] PR self-review

## Progress Log
- [2026-02-27T22:05:37.9790335+07:00] Started task. Checked out branch `feat/landing-incident-paging-aio`.
- [2026-02-27T22:08:00.0000000+07:00] Reviewed `src/app.ts`, `src/ui.ts`, and `test/app.test.ts` to scope landing sample rendering, incident routing, and SEO coverage.
- [2026-02-27T22:11:00.0000000+07:00] Implemented landing updates: removed “Sample Alert” heading, linked sample title to published incident URL, added 3 factual fear-based registration reasons, and added FAQ/AIO-oriented structured content and JSON-LD.
- [2026-02-27T22:12:00.0000000+07:00] Implemented incident pagination with SEO-friendly routes (`/incidents/page/:page`), canonical handling, prev/next link tags, and sitemap pagination URLs.
- [2026-02-27T22:13:00.0000000+07:00] Added/updated tests for landing AIO content, sample incident linking, pagination route behavior, and sitemap pagination entries.
- [2026-02-27T22:13:30.0000000+07:00] Verification complete: `npm run typecheck` and `npm test` passed; manually reviewed rendered HTML outputs and route behavior through test assertions and diff inspection.
- [2026-02-27T22:14:01.6079140+07:00] Completed PR self-review in `.tasks/landing-incident-paging-aio-review.md`.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [x] Manual verification documented and executed
- [x] PRD updated if scope changed

## Issues / Blockers
(none)

