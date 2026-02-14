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
- Dedup and `noindex` safeguards.

**Verification Steps**:
1. New verified incident produces a page automatically.
2. Every page passes quality gates (unique value + citations + dedup).
3. Thin/low-confidence pages are auto `noindex`.
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
- Deduplicate by URL + semantic similarity.
- Require minimum confidence threshold for instant alerts.
- Low-confidence items move to digest or review queue.
- Every remediation must carry at least one source citation.

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
   - Mitigation: quality gates, noindex fallback, periodic audit.

## 14. Assumptions and Defaults
1. ICP is mid-market SecOps/compliance teams.
2. Launch regions are US + EU.
3. Phase 1 channels are Email + Telegram.
4. Budget discipline is strict from day one.
5. Marketing uses credible urgency, not unsubstantiated claims.
6. pSEO pages publish only when quality gates pass.

## Changelog
- [2026-02-14] Initial PRD created for implementation kickoff with phased goals, verification steps, and exit criteria.
- [2026-02-14] Added implementation default: GPT-5 mini optional layer for semantic dedupe and published-incident enrichment, with budget caps and fallback to deterministic pipeline when LLM is unavailable.
- [2026-02-14] Added role-focused pSEO route set (`/for`, `/for/:role/:problem`) with strict quality gates, phased indexing flags, and waitlist CTA attribution for multi-persona demand capture.
