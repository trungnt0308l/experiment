# Task: ingestion-resource-limit-fix

## Meta
- **Status**: VERIFICATION
- **Branch**: feat/ai-security-incident-radar-prd
- **PR**: (link once created)
- **Created**: 2026-02-14T13:49:11+07:00
- **Last Updated**: 2026-02-14T13:49:11+07:00

## Objective
Fix Cloudflare resource-limit failures on manual ingestion runs by reducing subrequest fan-out and capping LLM call budgets.

## Plan
- [x] Step 1 — Diagnose ingestion request fan-out causing Worker 503
- [x] Step 2 — Add runtime caps for HN fetch count and LLM dedupe/enrich calls
- [x] Step 3 — Update env defaults/docs for safe limits
- [x] Step 4 — Add tests for cap resolution
- [x] Step 5 — Verification (typecheck + tests)

## Progress Log
- [2026-02-14T13:49:11+07:00] Implemented caps: HN_MAX_ITEMS, LLM_DEDUPE_MAX_CALLS, LLM_ENRICH_MAX_CALLS; reduced defaults for production safety.
- [2026-02-14T13:49:11+07:00] Updated wrangler.toml, .dev.vars.example, and README guidance.
- [2026-02-14T13:49:11+07:00] Added 
esolveRuntimeCaps tests and verified 
pm run typecheck + 
pm run test.

## Verification Checklist
- [x] All acceptance criteria met
- [x] Tests pass
- [x] No lint/type errors
- [ ] Manual verification documented and executed
- [ ] PRD updated if scope changed

## Issues / Blockers
(none)
- [2026-02-14T13:49:53+07:00] Added ingestion result counters (llmDedupeCalls, llmEnrichCalls) and surfaced them in admin ops status line for easier GPT-call verification.
