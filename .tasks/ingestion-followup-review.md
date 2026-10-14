## PR Review — ingestion-followup

### Summary
Fixes the P1 and two P2 findings from PRs #3/#2: oversized advisories cannot block later pages; GHSA collection obeys the configured shared per-run cap; the public audit queues/paces/retries NVD and reports incomplete evidence as failure. Adds source HTTP backoff and per-problem alert suppression to reduce recurring outage noise. Prepared on a separate worktree from deployed PR #3; no production writes were performed.

### Checklist
- [x] Follows project style and conventions
- [x] No hardcoded secrets or credentials; fixture tokens are explicit dummy values
- [x] No leftover debug statements; audit output and existing operational summaries are intentional
- [x] Error handling covers retained metadata limits, write/checkpoint failures, HTTP cooldowns, fallback failure, and audit failure status
- [x] Edge cases handled: UTF-8 byte limits, discarded metadata changes, existing larger GHSA pages, shared recovery cap, alert flapping and new failures
- [x] Shared utilities reused; audit queue extracted and unit tested
- [x] Parameterized DB queries; no added per-item lookup queries
- [x] Existing validated source/auth APIs retained; secret headers never included in audit output
- [x] UI accessibility unaffected; existing UI/security regressions pass
- [x] Responsive layout unaffected
- [x] Tests cover success, edge, and failure paths; full 112-test suite and D1 integrations pass
- [x] No unresolved TODO/FIXME introduced
- [x] No dependencies added
- [x] No breaking API or schema changes; PRD/README describe storage and scheduling behavior

### Issues Found
1. Oversized payloads threw before page checkpointing. Replaced with metadata truncation or bounded review quarantine, preserving original payload hashes; later-page and correction regressions pass.
2. GHSA page size bypassed the configured cap. Applied cap across normal/recovery scans with resumable partial-page offsets and untouched existing pagination links.
3. Public NVD audit requests launched concurrently and failed checks still exited successfully. Added an independent paced NVD queue, optional key, bounded retries, failure status, and deterministic scheduling tests; live audit caught CISA HTTP 403 and exited 1.
4. Outage fingerprint depended on the current keyword/error subset. Added per-issue/channel timestamps and normalization; recurring subsets/flapping stay suppressed for six hours and new failures notify immediately. Failed delivery remains retryable.
5. 503 did not stop remaining source queries. Added exponential persisted HTTP cooldowns, checked between queries/pages, while preserving failed scan positions and the rejected-token warning on public 403 fallback.
6. New fixture tuple and JavaScript lint glob required adjustments; corrected and recorded in lessons. Types/lint now pass.

### Suggestions
1. Rotate production GITHUB_API_TOKEN through the secret manager. Public access works from this host but shared Cloudflare egress quotas can differ.
2. Cloudflare access was refreshed automatically through Wrangler and verified by a read-only production D1 query and Worker version list. Deploy the reviewed build and inspect the next scheduled run; rollout has not been performed.
3. The CISA host 403 is a separate read-only observation; its official GitHub mirror returns 200. Check Worker health before changing that connector.

### Validation
112 tests passed; overall line coverage 81.16%, storage/network/alerts 100%, durable runtime 98.05%. Strict typecheck, ESLint, audit syntax checks, whitespace checks, and Worker dry-run build pass on Windows Node 24.21.0. Eight paced NVD checks plus public GitHub advisory access returned HTTP 200. Public audit exited 1 for the CISA website feed 403 rather than claiming complete success.

Production read-only verification confirms the latest cron completed, NVD is healthy, five new drafts published, and the pending queue is empty. GHSA still has rejected-token/public-403 errors and collected 100 advisories despite the configured cap. Windows CI exposed one fixture clock dependency; baseline-event reuse fixes it without changing application behavior.

Final Windows PR CI passed all required steps for d1d6258: https://github.com/trungnt0308l/experiment/actions/runs/38573823650.

The subsequent quota/backoff P1 was reproduced and personally reviewed before commit 9679ad2; see .tasks/ingestion-followup-p1-review.md. All 124 tests and Windows PR CI now pass: https://github.com/trungnt0308l/experiment/actions/runs/38580845316.
