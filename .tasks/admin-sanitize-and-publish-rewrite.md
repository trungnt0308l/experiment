# Task: admin-sanitize-and-publish-rewrite

## Meta
- **Status**: VERIFICATION
- **Branch**: feat/ai-security-incident-radar-prd
- **PR**: (link once created)
- **Created**: 2026-02-14T14:24:05+07:00
- **Last Updated**: 2026-02-14T14:24:05+07:00

## Objective
Fix admin ingestion rendering breakage on HTML/script content, unblock incident images, and enforce publish-time GPT rewrite for manual + auto published incidents.

## Plan
- [x] Step 1 — Inspect admin UI rendering and CSP/image policy
- [x] Step 2 — Sanitize admin ops card rendering in browser JS
- [x] Step 3 — Allow external image URLs in CSP for incident pages
- [x] Step 4 — Make manual publish call GPT rewrite synchronously
- [x] Step 5 — Add/adjust tests
- [x] Step 6 — Verification + deploy

## Progress Log
- [2026-02-14T14:24:05+07:00] Started task and scoped fixes for admin XSS-safe rendering, image CSP, and publish-time rewrite behavior.

## Verification Checklist
- [ ] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [ ] Manual verification documented and executed
- [ ] PRD updated if scope changed

## Issues / Blockers
(none)
- [2026-02-14T14:25:41+07:00] Admin ops card rendering now escapes untrusted title/summary/linkedin/x fields and sanitizes URLs before innerHTML insertion.
- [2026-02-14T14:25:41+07:00] Updated CSP img-src to allow external https images for incident pages.
- [2026-02-14T14:25:41+07:00] Manual publish now awaits GPT rewrite and returns enrichment status/error in response.
- [2026-02-14T14:25:41+07:00] Updated UI status message to show rewrite failure explicitly after publish.
- [2026-02-14T14:25:41+07:00] Verified typecheck/tests and deployed production version 306ad878-ec5b-4cda-a354-6cdd41a41a4d.
- [2026-02-14T14:40:02+07:00] Strengthened GPT rewrite prompt and cleanup rules; summary cap increased from 300 to 500 chars.
- [2026-02-14T14:40:02+07:00] Added llm test coverage for markdown/script cleanup; verified and deployed version fb7f2bc1-e7ec-459e-957e-d1a13cc3376b.
- [2026-02-14T14:40:10+07:00] Compacted Admin Ingestions cards: short preview with optional full-content details block to reduce viewport takeover.
- [2026-02-14T14:40:10+07:00] Strengthened GPT rewrite prompt and cleanup rules; summary cap increased from 300 to 500 chars.
- [2026-02-14T14:40:10+07:00] Added llm test coverage for markdown/script cleanup; verified and deployed version fb7f2bc1-e7ec-459e-957e-d1a13cc3376b.
