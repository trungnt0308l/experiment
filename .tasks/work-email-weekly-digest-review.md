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
- [x] 208 tests pass, including real Cloudflare D1 concurrent signup and newsletter lease behavior
- [x] No unresolved TODO/FIXME introduced
- [x] No dependencies added; clean lockfile install reported zero vulnerabilities
- [x] Work-email restriction, consent requirement and first-edition behavior documented in PRD and runbook

### Issues Found
1. PR feedback correctly identified inaccurate confirmation feedback for confirmed/suppressed addresses. The persistence function now returns its actual outcome (including atomic-race outcomes), and API/UI render queued, pending, confirmed, cooldown and unavailable messages. Integration tests and built-Worker Chrome checks verify no nonexistent mail is promised.
2. PR feedback questioned the redaction configuration. Inspection found obsolete tracked Wrangler 4.65 dependency files, while clean npm ci installs lockfile version 4.150. The actual installed schema explicitly defines redact_query_string and the CLI validates it as an allowed boolean. Cloudflare's current API documents the property. Production returned settings will verify the deployed value; no unsupported workaround or dependency upgrade is needed.
3. Replaying the legacy import cursor after a crash could re-invite a previously unsubscribed address after the one-hour throttle expired. Legacy import now skips every existing subscriber record; a regression preserves opt-out during replay. Explicit homepage re-signup still requires fresh confirmation.
4. An unsubscribed operator-suppressed subscriber could otherwise request a new invitation. Fixed by preserving suppressed status during unsubscribe and verified with a regression.
5. Accepted messages unnecessarily retained confirmation links/content. Accepted updates now clear payloads while pending retries retain immutable requests.
6. The late-confirmation test could share the edition's exact millisecond. The fixture now sets an explicit later timestamp; concurrency uses real D1 instead of an in-memory transaction approximation.
7. Original admin script syntax test requested an invalid route. Corrected to /admin/ops and exercised controls in headless Chrome.

### Suggestions
8. Monitor Resend acceptance/bounce dashboard and failed/review outbox counts. Acceptance is not proof of inbox delivery; provider event synchronization is documented as future work.
9. Reassess the personal/disposable-domain policy as new providers appear. Custom domains plus confirmation cannot establish a person's employment.

### Verification evidence
- Full test/coverage suite: 208 tests, 14 files, statements 84%, lines 85.11%, branches 73.8%.
- Strict TypeScript and ESLint pass. Production Wrangler dry-run bundle passes (435.33 KiB; gzip 99.11 KiB).
- Built Worker + real local D1 + headless Chrome: personal-domain feedback, work signup, explicit confirmation, mobile layout, authenticated read-only admin preview.
- Production rollout and actual confirmation acceptance recorded separately in the task log after deployment; not inferred from mocks.

### Production verification
- Deployed code 0055205 at 100% as version 5c072557-e24f-4688-964c-1d2508177af9; all three schedules and actual redact_query_string=true confirmed. Seven secret names preserved.
- Live public/input/auth checks pass; both Windows CI runs for deployed code succeed. Both PR review threads are resolved.
- Real cron sent six confirmation requests accepted by Resend with six IDs; six subscribers remain pending and no digest was sent. All 31 legacy rows retained; 25 personal-domain rows excluded. Accepted bodies cleared.
- Hourly ingestion completed healthy independently. Sanitized evidence: docs/evidence/newsletter-2026-10-20.json.
