# AI Security Incident Radar - Product Requirements Document (PRD)

## 1. Product Overview
AI Security Incident Radar is a cost-first SaaS service that monitors AI security incidents from trusted public sources and sends actionable alerts to security teams.

Phase 1 focuses on fast validation and low operating cost:
- Validation budget capped at `$200`.
- Notification channels limited to `Email` and `Telegram`.
- Real-time monitoring from compliant data sources.
- Actionable alerts that include issue summary, impact, remedy, and source citations.

## 2. Problem Statement
Organizations are adopting AI quickly, but most security and compliance teams cannot continuously track emerging AI threats, vulnerabilities, and incidents. This creates risk in four areas:
- Financial loss from delayed response.
- Data exposure due to unaddressed attack patterns.
- Regulatory non-compliance due to missed events and weak audit evidence.
- Operational overload from manual monitoring across fragmented channels.

Teams need a single low-cost service that detects relevant AI security incidents early and recommends immediate, source-backed actions.

## 3. Target Users and ICP
### Primary ICP
- Mid-market SecOps and security engineering teams.
- Compliance and risk teams that need evidence trails.
- Security-minded engineering managers responsible for AI feature delivery.

### Secondary Users
- MSSPs/consultants monitoring AI risk for multiple clients.
- Enterprise pilots requiring early-warning feeds before broader integration.

## 4. Value Proposition
- Detect AI security incidents quickly from multiple sources.
- Reduce triage time with pre-structured, source-backed remediation guidance.
- Improve governance posture with alert history and acknowledgment tracking.
- Start at low cost with clear upgrade path to team and enterprise workflows.

## 5. Scope and Non-Goals
### In Scope (Initial)
- Marketing website and subscription flow.
- Source ingestion and incident classification.
- Alert delivery via Email and Telegram.
- Alert history and acknowledgment tracking.
- pSEO incident pages with quality controls.

### Out of Scope (Initial)
- SMS in Phase 1.
- Full SOC automation/SOAR orchestration.
- Deep endpoint/network telemetry ingestion.
- On-prem deployment.
- Production use of unsupported or ToS-violating scraping paths.

## 6. Phased Roadmap

### Phase 0 - Demand Validation (2 weeks, total cap: $200)
**Goal**: Prove real demand before product build.

**Deliverables**:
- 1-page website.
- Waitlist form.
- Analytics tracking.
- Small paid acquisition test.
- Concierge alert sample delivered manually.

**Verification Steps**:
1. Spend ledger confirms total spend `<= $200`.
2. Landing page conversion tracked by source/channel.
3. At least `12` qualified signups (security/compliance personas).
4. At least `4` discovery calls completed.
5. At least `2` pilot-interest responses.
6. At least `1` LOI or paid deposit target.

**Exit Criteria**:
- At least `4 of 6` verification thresholds are met.

### Phase 1 - MVP Launch (Email + Telegram only)
**Goal**: Deliver usable incident monitoring and actionable alerts with minimal infrastructure cost.

**Deliverables**:
- Marketing website.
- Auth + subscriptions.
- Source ingestion pipeline.
- Classification and remediation generation.
- Alert delivery (Email, Telegram).
- Alert history page.

**Data Sources**:
- Hacker News API.
- Curated advisories/RSS.
- Selected X monitoring path using compliant API/tooling first.

**Verification Steps**:
1. End-to-end alert from ingestion to delivery works for all enabled sources.
2. Median alert latency under `10 minutes` for API sources.
3. False-positive review sample shows precision `>= 75%`.
4. Email and Telegram delivery success rate `>= 95%` in test window.
5. Quiet hours and topic filters function correctly.

**Exit Criteria**:
- All checks pass for `7` consecutive days.

### Phase 2 - Automation + Monetization
**Goal**: Reduce manual operations and start paid conversion.

**Deliverables**:
- Billing tiers.
- Team accounts.
- Alert tuning controls.
- Remediation templates.
- Audit logs.

**Verification Steps**:
1. Payment flow supports trial to paid conversion.
2. Subscription lifecycle (upgrade/cancel/reactivate) is tested.
3. Alert configuration changes apply without downtime.
4. Remediation snippets include citation links for every alert.

**Exit Criteria**:
- First `3` paying teams onboarded and system stability confirmed.

### Phase 3 - pSEO Engine
**Goal**: Scale inbound demand with automated incident/threat landing pages.

**Deliverables**:
- Auto page generation pipeline.
- Template system.
- Citation validator.
- Dedup and public archive review safeguards.

**Verification Steps**:
1. New verified incident produces a page automatically.
2. Every page passes quality gates (unique value + citations + dedup).
3. Published incident pages remain indexable, stay in the sitemap, and are tracked for quality corrections.
4. Organic impressions and indexed pages are tracked per keyword cluster.

**Exit Criteria**:
- `30+` indexed high-quality pages and no search policy violations.

### Phase 4 - Scale Channels and Enterprise Readiness
**Goal**: Expand channels and enterprise trust posture.

**Deliverables**:
- Optional SMS channel.
- Slack/Teams integration.
- RBAC improvements.
- Compliance export workflows.

**Verification Steps**:
1. Channel failover and retry logic validated.
2. Access controls and audit trails verified.
3. Data deletion/export tested for GDPR workflows.

**Exit Criteria**:
- Enterprise pilot readiness checklist completed.

## 7. Functional Requirements
1. Website promotes service with fear-forward, evidence-backed messaging.
2. Waitlist and trial onboarding capture role, company, and interests.
3. Monitoring scans selected sources continuously.
4. Alert includes issue, impact, remedy, confidence, and source links.
5. Users can choose instant vs digest mode, topics, and severity thresholds.
6. Phase 1 excludes SMS by design.
7. Alert acknowledgment status is stored and queryable.

## 8. Public APIs / Interfaces / Types
### External API (v1)
- `POST /v1/subscribers`
- `POST /v1/subscribers/{id}/channels` (supports `email|telegram` in Phase 1)
- `POST /v1/subscribers/{id}/topics`
- `GET /v1/alerts`
- `POST /v1/alerts/{id}/ack`

### Internal Interfaces
- `SourceConnector.fetch(since_cursor)`
- `Normalizer.toEvent(raw_item)`
- `Classifier.score(event)`
- `RemedyEngine.generate(event)`
- `Notifier.send(alert, channel)`

### Core Types
- `Alert`: id, title, summary, severity, confidence, categories, sources, remedies, timestamps.
- `SourceItem`: source metadata, content snippet, URL, ingestion timestamp.
- `Recommendation`: action, rationale, priority, owner role, reference links.
- `DeliveryAttempt`: channel, result, provider message id, retries, timestamps.

## 9. Data Sources and Ingestion Policy
### Initial Sources
- Hacker News API.
- CISA/NVD/OWASP GenAI and selected vendor advisories via RSS/API.
- X monitoring using compliant API/tooling paths first.

### X Monitoring Policy (Default)
1. Primary approach is compliant API/tooling paths.
2. Enforce keyword/entity allowlists and spend caps.
3. Web UI scraping is not used for production customer alerts unless explicit legal approval is documented.

### Ingestion Rules
- Bound source concurrency, rotate scheduling, and reserve time for durable processing. Each RSS feed has independent retry/health state; successful siblings cannot hide a failure.
- Run optional enrichment separately from scheduled collection with persistent per-draft retry eligibility. Enrichment failures remain diagnostic and do not send ingestion outage notifications.
- Alert on sustained transient failures (three scans or three hours), immediate configuration/authentication/upstream quota failures, stale source success, stale heartbeat, and aged/quarantined work. Preserve each issue's reminder time independently.
- Public pages may serve a successful cached copy for up to 24 hours during rendering/database outages. Normal freshness is one minute. Exclude private, credential-bearing, parameterized, and error responses.
- Use consistent page-specific SEO titles/descriptions, self canonical pagination, source-cited article/breadcrumb data, and persisted modification dates. Do not fabricate sitemap changes for unchanged pages.
- Retain normalized source payloads in a durable D1 inbox before advancing paginated scan checkpoints; retries must survive source disappearance, timestamp ties, and publication failures.
- Deduplicate by stable source identifier, canonical CVE, and exact source URL. LLM decisions are not a prerequisite for ingestion or publication; optional enrichment has its own bounded retry path.
- Scan NVD/GHSA published-date windows initially and modification-date windows subsequently, with overlap and persistent page progress. Respect HTTP rate-limit cooldowns and per-run resource budgets.
- Share an atomic, owned lease across scheduled and manual ingestion. Database/lease failures are fail-closed.
- Prefer authoritative source severity/CVSS over keyword severity. Retain full classification evidence while keeping public summaries concise.
- Show upstream advisory disclosure separately from Radar page publication; neither claims a verified exploitation date. Preserve original publication dates and operator-reviewed drafts during retries.
- Provide authenticated source health, run history, backlog age, historical orphan visibility, and bounded recovery previews. Recovery is explicit and resumable; old orphaned records require individual review rather than blind publication.
- Paginate public archives in D1 and query incident details by slug, without the former 200-record accessibility cutoff.
- Enable deduplicated operational alerts only to existing configured operator Email/Telegram destinations. An independent monitor must poll the authenticated health endpoint to detect a scheduler that never fires.
- Require minimum confidence threshold for instant alerts.
- Low-confidence items move to digest or review queue.
- Every remediation must carry at least one source citation.
- Public incident pages include AI-relevance analysis, substantive page detail, and source citations; weaker pages are corrected through editorial review rather than search exclusion once published.

## 10. Cost and Infrastructure Plan
### Cost Principles
- Minimize fixed cost from day one.
- Gate variable costs with budget caps and throttling.
- Scale by validated demand, not speculative capacity.

### Initial Stack
- Runtime/Workers: Cloudflare Workers + Cron + Queues.
- Data/Auth: Supabase.
- Email: Resend or Brevo free tier.
- Telegram: Bot API.
- Observability: free-tier analytics and error monitoring.

### Mandatory Cost Controls
1. Per-source monthly budget caps.
2. Queue backpressure and retry limits.
3. Dedup before expensive enrichment steps.
4. Prioritized polling by source value.

## 11. Metrics and Success Criteria
### Demand Metrics (Phase 0)
- Qualified signup count.
- Discovery call count.
- Pilot-interest responses.
- LOI/deposit count.

### Product Metrics (Phase 1+)
- Median alert latency.
- Alert precision (false-positive adjusted).
- Delivery success rate per channel.
- Weekly active teams and alert acknowledgment rate.

### Business Metrics
- Trial-to-paid conversion.
- Monthly recurring revenue.
- Gross margin after messaging and data-source costs.

## 12. Testing and QA Scenarios
### Unit Tests
- Normalization mapping.
- Dedup behavior.
- Severity scoring.
- Citation validation.

### Integration Tests
- Ingest-to-alert pipeline per source connector.
- Notification delivery and retries per channel.
- Subscriber preference updates and filtering.

### End-to-End Tests
- Subscriber onboarding.
- Topic and severity configuration.
- Alert receipt and acknowledgment lifecycle.

### Failure Tests
- Source outage handling.
- Rate limit handling.
- Notification provider failure retries and dead-letter flow.

### Security Tests
- Input validation and sanitization.
- Secret handling and rotation process.
- RBAC authorization checks.

## 13. Risks and Mitigations
1. **Source policy risk**: API/ToS changes.
   - Mitigation: multi-source strategy, compliant connectors first, feature flags.
2. **False positives**: alert fatigue and churn.
   - Mitigation: confidence thresholds, dedup, feedback loop, digest option.
3. **Regulatory/legal claim risk**: marketing or remediation over-claims.
   - Mitigation: evidence-backed copy policy, citation requirements, legal review checklist.
4. **Cost drift**: rising data/API or notification costs.
   - Mitigation: spend caps, throttles, tier limits, monthly cost review.
5. **SEO quality risk** for pSEO pages.
   - Mitigation: quality review, citation requirements, periodic audit.

## 14. Assumptions and Defaults
1. ICP is mid-market SecOps/compliance teams.
2. Launch regions are US + EU.
3. Phase 1 channels are Email + Telegram.
4. Budget discipline is strict from day one.
5. Marketing uses credible urgency, not unsubstantiated claims.
6. Published incident pages remain in the public archive once released; quality issues are handled through updates and corrections rather than selective deindexing.

## Changelog
- [2026-10-20] work-email-weekly-digest: Require custom work domains with shared browser/server validation. Existing eligible signups must confirm before Monday 13:00 UTC / 20:00 Bangkok weekly digests through the existing Resend service. Add seven-day confirmation, unsubscribe, immutable source-cited editions, durable retries and authenticated preview/health. Preserve personal-domain legacy records without contacting or auto-enrolling them. First eligible edition: October 26; no rollout catch-up. Provider acceptance differs from inbox delivery; bounce/complaint syncing remains outside this release. See docs/newsletter.md.
- [2026-10-14] ingestion-followup: Oversized metadata is marked and bounded, with oversized core content quarantined for review so later pages remain collectable. GHSA respects the configured shared per-run cap with resumable partial pages. Source HTTP failures retain checkpoints and use exponential cooldowns; alerts suppress recurring problems independently for six hours while new failures alert immediately. Public audit checks pace NVD and fail when evidence is incomplete.
- [2026-02-14] Initial PRD created for implementation kickoff with phased goals, verification steps, and exit criteria.
- [2026-02-14] Added implementation default: GPT-5 mini optional layer for semantic dedupe and published-incident enrichment, with budget caps and fallback to deterministic pipeline when LLM is unavailable.
- [2026-02-25] ghsa-advisory-parsing-normalization-hotfix: Added summary normalization safeguards (source ingestion + render caps), GHSA summary-first parsing, and admin long-summary cleanup endpoint for legacy incident content.
- [2026-02-25] reapply-homepage-friction: Removed homepage risk checkbox gate again and restored email-first waitlist flow with optional interests.
- [2026-03-07] seo-content-enhancement-plan: Added public indexing quality gate guidance, methodology page requirement, stricter AI relevance matching, and sitemap exclusion behavior for weak AI-overlap incident pages.
- [2026-03-07] restore-full-incident-archive: Restored all published incidents to the public archive, sitemap, and default indexation path while keeping editorial review and correction guidance.
- [2026-10-13] ingestion-reliability: Added durable collection/retry checkpoints, paginated modification scans, owned leases, source severity/date provenance, recovery controls, health/alerts, database-backed archives, and Windows Node 24 verification. Decoupled optional enrichment from publication so provider outages cannot suppress incidents.
- [2026-10-14] ingestion-followup: Distinguish local collection-budget pauses from upstream failures. Local quotas retain checkpoint progress and warnings without increasing failure streaks or persisting outage cooldowns; recover legacy quota-only cooldowns automatically. Record source success only on successful source responses.
- [2026-10-20] robust-architecture-seo: Separate enrichment scheduling; bound/rotate source workers; reserve processing time; add per-feed timeout backoff, actionable alerts, official KEV fallback, and bounded public cache recovery. Correct titles, descriptions, canonical duplicates, pagination schema, citations, breadcrumbs, modification dates, and sitemap signals. Retain D1 and published incident indexation.
