# Weekly work-email digest

The homepage collects work email for one source-cited AI security roundup each Monday at 13:00 UTC / 20:00 Bangkok. The existing Resend sender is `AI Security Radar <alerts@aisecurityradar.com>`. It previously sent only operator signup notifications.

## Subscription behavior

The same syntax/domain policy runs in the browser and server. Common personal and temporary providers, including Gmail, Hotmail, Outlook and iCloud, are rejected, including their subdomains. Company domains hosted by Google Workspace or Microsoft 365 are allowed. A domain blocklist cannot prove employment or exhaustively identify disposable providers; confirmation proves mailbox control.

Signup atomically persists a pending subscriber and confirmation outbox item. Confirmation links expire after seven days; requests are throttled to one per hour per address. Opening a link is read-only: the recipient presses **Confirm my subscription**. Existing eligible signups follow the same flow. Personal-domain legacy records are preserved without contacting them.

Tokens are random 256-bit values; subscribers store SHA-256 confirmation hashes. Pending outbox bodies retain the original link only for exact retries. Accepted message bodies are cleared. Confirmation/unsubscribe pages are uncached, noindex and use `no-referrer`; Worker logging redacts query strings.

Signup returns the actual result: confirmation queued, already pending, already confirmed, temporarily throttled or unavailable. The form never claims a new email for an already confirmed or suppressed subscription.

Footer unsubscribe links open a deliberate form. RFC 8058 one-click clients POST to the same URL and receive an empty 200. Unsubscribe changes status and cancels pending/sending work atomically. An already in-flight provider request can still be accepted. Later signups require fresh confirmation.

## Scheduling and content

Migration `0008_newsletter.sql` adds independent subscriber, edition, outbox and state tables. The five-minute cron handles newsletter work only; collection remains hourly and enrichment runs at minute 15. Keep all three trigger expressions configured.

The first run records initialization and invites eligible legacy signups in pages of 100, using a durable ID cursor. Existing subscriber records are never re-enrolled by cursor replay; an opt-out requires a new explicit signup. It skips historical editions at rollout. The first scheduled edition after the October 20 rollout is Monday October 26, 2026, 13:00 UTC.

Editions cover `[previous Monday 13:00 UTC, this Monday 13:00 UTC)` using Radar publication time. Each counts published advisories and selects up to five, prioritizing high severity then source disclosure date. Highlights include a short summary, original disclosure date, incident/source links, and an available response step. Copy distinguishes new Radar additions from older disclosures. No publications means no digest that week.

Content is snapshotted once. Confirmed recipients at snapshot creation are paged into the outbox, unique by subscriber/edition; later confirmations join the next edition. Repeated jobs resume without rebuilding content or duplicating recipients. Eligibility is rechecked immediately before sending. Personal domains cannot receive digests even if manually marked confirmed.

## Delivery and controls

`NEWSLETTER_ENABLED=true`, `DB` and the existing `RESEND_API_KEY` enable delivery; development defaults off. No new service, key or contact import is needed. We use `/emails` with application-managed recipients and unsubscribe state, without requiring native Broadcasts/Segments or broader key permissions.

An owned two-minute lease prevents overlapping newsletter jobs. Each delivery pass handles at most 20 items with a 20-second deadline, eight-second request cap and 650 ms pacing. HTTP 429 stops the batch and respects Retry-After. Authentication rejection stops the batch and marks that attempt failed. Transient failures back off, with at most five attempts. Retries retain the exact payload and `newsletter/<outbox-id>` key. After 23 hours from the first attempt, automatic retries become `review`, below Resend's 24-hour key retention. Check provider history before manually requeueing these rows.

`accepted` means Resend returned a message ID; it does not establish inbox delivery. Bounce/complaint events are not synced into D1 in this release. Review the Resend delivery dashboard and suppression list for failures. Local unsubscribe cancels queued work; `suppressed` is reserved for operator suppression. Existing operator signup notifications remain independent.

The authenticated admin console provides **Check Status**, **Preview Last 7 Days**, and **Process Pending Mail**. The rolling preview does not write editions or send mail. Processing can send confirmations, retries or a due weekly edition. Endpoints use existing `Authorization: Bearer <admin-token>` authentication:

- `GET /api/admin/newsletter/health`: aggregate counts, latest job and schedule, without recipient addresses.
- `GET /api/admin/newsletter/preview`: rolling seven-day subject, text and HTML, `dryRun: true`.
- `POST /api/admin/newsletter/run`: bounded processing followed by aggregate status.

Inspect failed/review counts alongside latest job status: a completed job may contain rejected attempts. Never copy pending payloads or token URLs into public logs.

## Rollout and rollback

Apply the additive migration before deployment. Preserve dashboard variables/secrets with `--keep-vars`; ensure `NEWSLETTER_ENABLED=true` on the new version. Verify all three triggers, HTTPS origin, public personal-domain rejection and aggregate pending/accepted counts without exposing addresses. Cron propagation can take several minutes.

Always run the lockfile's clean `npm ci` toolchain. The repository contains obsolete tracked dependency files from Wrangler 4.65; the current lockfile and actual deployment use 4.150. Its installed Observability schema and CLI validation support `redact_query_string`. Verify the returned production `settings.observability.redact_query_string` is true after deployment; do not infer redaction from an old vendored schema. The [Cloudflare Workers API](https://developers.cloudflare.com/api/resources/workers/) documents this log/trace control.

To pause sending, deploy with `NEWSLETTER_ENABLED=false`. To restore the preceding application version `669b6f74-f01a-447c-9e85-3d8838af311a`, also restore only hourly and minute-15 triggers: older code interprets the five-minute expression as ingestion. Retain additive tables, consent and delivery history.

## Provider references

- [Resend idempotency and 24-hour retention](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Application-managed unsubscribe](https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails)
- [Sending versus full-account API key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key)
- [Native Broadcasts](https://resend.com/docs/dashboard/broadcasts/introduction)
