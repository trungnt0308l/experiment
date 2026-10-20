## PR Review — work-email-weekly-digest

### Summary
Replace collection-only signup with confirmed work-email subscriptions and a Monday weekly digest using the existing Resend sender. Independent D1 consent, immutable edition snapshots and durable delivery state protect ingestion and avoid duplicate mail during retries.

### Checklist
- [x] Follows project style and conventions; typed modules separate policy, content, persistence, delivery and routes
- [x] No hardcoded secrets or credentials; existing secret binding reused
- [x] No leftover debug statements in application code
- [x] Errors recorded without leaking addresses, API keys or token URLs
- [x] Edge cases covered: malformed input, personal domains, expired/rotated tokens, scanner GETs, unsubscribe, suppressed status, empty editions, deployment backlog, late confirmation, provider rejection, Retry-After and expired idempotency window
- [x] Shared work-email utility used on frontend/backend; existing request helper reused
- [x] DB operations bounded, indexed and parameterized; recipient/outbox batches intentional and limited
- [x] API validation and admin authentication verified
- [x] Labels, inline feedback, live regions and explicit keyboard-operable confirmation/unsubscribe forms
- [x] Headless Chrome mobile viewport 390px has no horizontal overflow
- [x] 206 tests pass, including real Cloudflare D1 concurrent signup and newsletter lease behavior
- [x] No unresolved TODO/FIXME introduced
- [x] No dependencies added; clean lockfile install reported zero vulnerabilities
- [x] Work-email restriction, consent requirement and first-edition behavior documented in PRD and runbook

### Issues Found
1. An unsubscribed operator-suppressed subscriber could otherwise request a new invitation. Fixed by preserving suppressed status during unsubscribe and verified with a regression.
2. Accepted messages unnecessarily retained confirmation links/content. Accepted updates now clear payloads while pending retries retain immutable requests.
3. The late-confirmation test could share the edition's exact millisecond. The fixture now sets an explicit later timestamp; concurrency uses real D1 instead of an in-memory transaction approximation.
4. Original admin script syntax test requested an invalid route. Corrected to /admin/ops and exercised controls in headless Chrome.

### Suggestions
1. Monitor Resend acceptance/bounce dashboard and failed/review outbox counts. Acceptance is not proof of inbox delivery; provider event synchronization is documented as future work.
2. Reassess the personal/disposable-domain policy as new providers appear. Custom domains plus confirmation cannot establish a person's employment.

### Verification evidence
- Full test/coverage suite: 206 tests, 14 files, statements 83.94%, lines 85.07%, branches 73.86%.
- Strict TypeScript and ESLint pass. Production Wrangler dry-run bundle passes (433.97 KiB; gzip 98.83 KiB).
- Built Worker + real local D1 + headless Chrome: personal-domain feedback, work signup, explicit confirmation, mobile layout, authenticated read-only admin preview.
- Production rollout and actual confirmation acceptance recorded separately in the task log after deployment; not inferred from mocks.
