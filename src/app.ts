import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  assessIncidentQuality,
  type IncidentEntry,
  type LandingSampleAlert,
  renderAdminMetricsPage,
  renderAdminOpsPage,
  renderIncidentDetailPage,
  renderIncidentsPage,
  renderLandingPage,
  renderMethodologyPage,
  renderPrivacyPage,
  renderSecurityPage,
  renderTermsPage,
} from './ui';
import { createDraftFromIngestionEvent, normalizeLongSummaries, runIngestionPipeline } from './ingestion';
import { llmEnrichIncident } from './llm';

export type EnvBindings = {
  APP_NAME?: string;
  SITE_URL?: string;
  GA_MEASUREMENT_ID?: string;
  NVD_API_KEY?: string;
  GITHUB_API_TOKEN?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_API_BASE_URL?: string;
  LLM_DEDUPE_ENABLED?: string;
  LLM_ENRICH_ENABLED?: string;
  LLM_DEDUPE_MAX_CALLS?: string;
  LLM_ENRICH_MAX_CALLS?: string;
  HN_MAX_ITEMS?: string;
  RSS_FEEDS?: string;
  MAX_EVENT_AGE_DAYS?: string;
  ENABLE_HN_SOURCE?: string;
  INGEST_CRON_MAX_RUNTIME_MS?: string;
  INGEST_CRON_MAX_PROCESS_EVENTS?: string;
  INGEST_CRON_MAX_DB_WRITES?: string;
  INGEST_CRON_FETCH_TIMEOUT_MS?: string;
  INGEST_CRON_DISABLE_LLM_DEDUPE?: string;
  INGEST_CISA_MAX_ITEMS_PER_RUN?: string;
  INGEST_EUVD_MAX_ITEMS_PER_RUN?: string;
  INGEST_GHSA_MAX_ITEMS_PER_RUN?: string;
  INGEST_RSS_MAX_ITEMS_PER_FEED?: string;
  INGEST_NVD_RESULTS_PER_KEYWORD?: string;
  AUTO_PUBLISH_TRUSTED_SOURCES?: string;
  AUTO_PUBLISH_MIN_SEVERITY?: string;
  AUTO_PUBLISH_MIN_CONFIDENCE?: string;
  ADMIN_API_TOKEN?: string;
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL_TO?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  DB?: D1Database;
};

export type WaitlistSignup = {
  email: string;
  company: string;
  role: string;
  interests: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  landingPath?: string;
};

type SignupRow = {
  email: string;
  company: string;
  role: string;
  interests: string;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  landing_path: string | null;
  created_at: string;
};

type MetricsCountRow = {
  count: number;
};

type MetricsDailyRow = {
  day: string;
  count: number;
};

type MetricsSourceRow = {
  source: string;
  count: number;
};

type PublishedIncidentRow = {
  draft_id: number;
  slug: string;
  headline: string;
  title: string;
  summary: string | null;
  url: string;
  source: string;
  severity: string | null;
  confidence: number | null;
  event_published_at: string | null;
  published_at: string | null;
  created_at: string;
  enriched_summary: string | null;
  enriched_impact: string | null;
  enriched_remedy_json: string | null;
};

const INCIDENT_SUMMARY_MAX_CHARS = 760;
const LANDING_SAMPLE_SUMMARY_MAX_CHARS = 260;
const INCIDENTS_PER_PAGE = 10;

function toSourceKind(value: string): 'hn' | 'nvd' | 'rss' | 'ghsa' | 'cisa_kev' | 'euvd' {
  if (value === 'hn' || value === 'nvd' || value === 'rss' || value === 'ghsa' || value === 'cisa_kev' || value === 'euvd') {
    return value;
  }
  return 'rss';
}

function getSortedIncidents(items: IncidentEntry[]): IncidentEntry[] {
  return [...items].sort((a, b) => b.sortDate.localeCompare(a.sortDate));
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function toSortDate(value: string | null | undefined, fallbackIso: string): string {
  if (!value) {
    return fallbackIso;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return fallbackIso;
  }
  return new Date(ms).toISOString();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function parseRemedyJson(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function getSiteUrl(c: Context<{ Bindings: EnvBindings }>): string {
  const configured = c.env.SITE_URL?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  return new URL(c.req.url).origin.replace(/\/+$/, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text: string, term: string): boolean {
  const pattern = term
    .trim()
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join('\\s+');
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text);
}

function classifyIncidentTheme(title: string, summary: string): 'prompt_injection' | 'code_execution' | 'artifact' | 'data_exposure' | 'identity' | 'availability' | 'generic' {
  const haystack = `${title} ${summary}`.toLowerCase();
  if (containsTerm(haystack, 'prompt injection') || containsTerm(haystack, 'jailbreak')) {
    return 'prompt_injection';
  }
  if (
    containsTerm(haystack, 'remote code execution') ||
    containsTerm(haystack, 'arbitrary code execution') ||
    containsTerm(haystack, 'command injection') ||
    containsTerm(haystack, 'rce')
  ) {
    return 'code_execution';
  }
  if (
    containsTerm(haystack, 'pickle') ||
    containsTerm(haystack, 'deserialization') ||
    containsTerm(haystack, 'model weights')
  ) {
    return 'artifact';
  }
  if (
    containsTerm(haystack, 'ssrf') ||
    containsTerm(haystack, 'exfiltration') ||
    containsTerm(haystack, 'data leak') ||
    containsTerm(haystack, 'file disclosure')
  ) {
    return 'data_exposure';
  }
  if (
    containsTerm(haystack, 'authentication bypass') ||
    containsTerm(haystack, 'authorization bypass') ||
    containsTerm(haystack, 'account takeover') ||
    containsTerm(haystack, 'privilege escalation')
  ) {
    return 'identity';
  }
  if (containsTerm(haystack, 'denial of service') || containsTerm(haystack, 'dos')) {
    return 'availability';
  }
  return 'generic';
}

function buildFallbackIncidentImpact(
  title: string,
  summary: string,
  source: string,
  severity: 'low' | 'medium' | 'high',
  confidence: number | null
): string {
  const theme = classifyIncidentTheme(title, summary);
  const confidenceLabel = typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : 'unscored';
  const sourceLabel = source.toUpperCase();

  const detail =
    theme === 'prompt_injection'
      ? 'The weakness can let untrusted prompts or tool instructions bypass intended guardrails and trigger unsafe downstream actions or data access.'
      : theme === 'code_execution'
        ? 'The issue can create a path to command execution inside an AI-facing product, plugin, copilot, or supporting service runtime.'
        : theme === 'artifact'
          ? 'The advisory affects model artifacts or serialized AI assets, which can bypass inspection or execute during load and validation steps.'
          : theme === 'data_exposure'
            ? 'The flaw can expose internal data, local files, or connected systems through AI workflow connectors and supporting services.'
            : theme === 'identity'
              ? 'The issue can weaken identity or authorization boundaries around AI features, plugins, or operator workflows.'
              : theme === 'availability'
                ? 'The advisory describes an availability or resource-exhaustion path that can disrupt AI-serving components and supporting automation.'
                : 'The advisory has meaningful security implications for an AI-related product, dependency, or workflow and should be triaged against deployed usage.';

  return trimToSentence(
    `${detail} Severity ${severity.toUpperCase()}. Classification confidence ${confidenceLabel}. Source channel ${sourceLabel}.`,
    420
  );
}

function buildFallbackIncidentRemedy(title: string, summary: string): string[] {
  const theme = classifyIncidentTheme(title, summary);

  if (theme === 'prompt_injection') {
    return [
      'Review prompt templates, tool-invocation rules, and system instructions for the affected workflow.',
      'Restrict sensitive tools, retrieval scopes, and outbound actions until guardrails are validated.',
      'Search logs for prompt override attempts, unusual tool chains, and sensitive data exposure after user input.',
    ];
  }
  if (theme === 'code_execution') {
    return [
      'Identify every environment that runs the affected AI plugin, assistant, CLI, or supporting package.',
      'Patch or isolate the vulnerable component and remove risky execution permissions while validation is in progress.',
      'Review process execution, outbound connections, and file-write logs for signs of post-exploitation activity.',
    ];
  }
  if (theme === 'artifact') {
    return [
      'Inventory model artifacts, serialized objects, and scanners that touch the affected package or workflow.',
      'Block untrusted model files and revalidate registry, CI, or notebook loading paths before restoring normal operation.',
      'Review artifact provenance, scanner output, and recent model-ingestion activity for suspicious changes.',
    ];
  }
  if (theme === 'data_exposure') {
    return [
      'Confirm whether the affected component can reach internal metadata, local files, or connected data stores.',
      'Restrict outbound requests and sensitive data access paths until a patch or mitigation is in place.',
      'Inspect logs for unusual downloads, webhook calls, retrieval requests, or responses containing internal content.',
    ];
  }
  if (theme === 'identity') {
    return [
      'Audit the affected AI workflow for exposed admin actions, service tokens, and user-to-tool permissions.',
      'Rotate or disable sensitive credentials if the issue could weaken authentication or authorization boundaries.',
      'Review access logs for unusual account actions, scope changes, or integrations created after disclosure.',
    ];
  }
  if (theme === 'availability') {
    return [
      'Identify inference endpoints, parsing jobs, or queues that rely on the affected component.',
      'Apply vendor mitigations and add rate, size, or input controls to reduce exhaustion risk during triage.',
      'Monitor latency, restart frequency, queue backlog, and saturation indicators for active disruption.',
    ];
  }

  return [
    'Confirm whether affected products, models, or integrations are used in your environment.',
    'Apply vendor fixes or mitigations and restrict risky permissions until verified.',
    'Monitor logs for related indicators and document containment for audit evidence.',
  ];
}

function toIncidentEntry(row: PublishedIncidentRow): IncidentEntry {
  const sortDate = toSortDate(row.event_published_at ?? row.published_at, row.created_at);
  const title = row.headline || row.title;
  const rawSummary = collapsePlainText(row.enriched_summary ?? row.summary ?? row.title) ||
    collapsePlainText(row.title) ||
    'AI security incident requiring review.';
  const summary = trimToSentence(rawSummary, INCIDENT_SUMMARY_MAX_CHARS);
  const severity = (row.severity ?? 'medium').toLowerCase() as 'low' | 'medium' | 'high';
  const incidentDate = formatDate(row.event_published_at ?? row.published_at ?? row.created_at);
  const publishedDate = formatDate(row.published_at ?? row.created_at);
  const slug = row.slug || `${slugify(title)}-${row.draft_id}`;
  const enrichedRemedy = parseRemedyJson(row.enriched_remedy_json);
  const impactSource = collapsePlainText(row.enriched_impact ?? '').trim();
  const impact = impactSource
    ? trimToSentence(impactSource, 420)
    : buildFallbackIncidentImpact(row.title, row.summary ?? row.title, row.source, severity, row.confidence);
  const remedy = enrichedRemedy.length >= 3 ? enrichedRemedy : buildFallbackIncidentRemedy(row.title, row.summary ?? row.title);

  const incident: IncidentEntry = {
    slug,
    title,
    sourceTitle: row.title,
    sortDate,
    incidentDate,
    publishedDate,
    summary,
    impact,
    remedy,
    sources: [{ label: `${row.source.toUpperCase()} source`, url: row.url }],
    sourceKind: toSourceKind(row.source),
    severity,
    confidence: row.confidence,
  };
  const quality = assessIncidentQuality(incident);
  return {
    ...incident,
    indexable: quality.indexable,
    qualityReasons: quality.reasons,
  };
}

function getIndexableIncidents(items: IncidentEntry[]): IncidentEntry[] {
  return items.filter((item) => item.indexable !== false);
}

function toLandingSample(incident: IncidentEntry | undefined, siteUrl: string): LandingSampleAlert | undefined {
  if (!incident || incident.sources[0]?.url === undefined) {
    return undefined;
  }

  const severity = (incident.severity ?? 'medium').toLowerCase();
  const severityLabel = severity === 'high' ? 'High Severity' : severity === 'low' ? 'Low Severity' : 'Medium Severity';
  const riskSummary = trimToSentence(collapsePlainText(incident.summary), LANDING_SAMPLE_SUMMARY_MAX_CHARS);
  return {
    title: incident.title,
    incidentUrl: `${siteUrl}/incidents/${encodeURIComponent(incident.slug)}`,
    severity: severityLabel,
    summary: `Risk: ${riskSummary}`,
    remedy: trimToSentence(incident.remedy[0] ?? 'Validate exposure scope, apply mitigations, and review related telemetry immediately.', 170),
    sourceLabel: incident.sources[0].label,
    sourceUrl: incident.sources[0].url,
  };
}

async function fetchPublishedDbIncidents(db: D1Database | undefined): Promise<IncidentEntry[]> {
  if (!db) {
    return [];
  }

  const result = await db
    .prepare(
      `SELECT
         d.id AS draft_id,
         d.slug,
         d.headline,
         d.published_at,
         d.created_at,
         e.title,
         e.summary,
         e.url,
         e.source,
         e.severity,
         e.confidence,
         e.published_at AS event_published_at,
         d.enriched_summary,
         d.enriched_impact,
         d.enriched_remedy_json
       FROM draft_posts d
       JOIN ingested_events e ON e.id = d.event_id
       WHERE d.status = 'published'
       ORDER BY datetime(COALESCE(e.published_at, d.published_at, d.created_at)) DESC
       LIMIT 200`
    )
    .all<PublishedIncidentRow>();

  const rows = result.results ?? [];
  return rows.map(toIncidentEntry);
}

async function listIncidents(db: D1Database | undefined): Promise<IncidentEntry[]> {
  const published = await fetchPublishedDbIncidents(db);
  return getSortedIncidents(published);
}

function parsePageNumber(raw: string | undefined): number | null {
  if (!raw) {
    return 1;
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function incidentsPagePath(page: number): string {
  return page <= 1 ? '/incidents' : `/incidents/page/${page}`;
}

type DraftEventForEnrichment = {
  draft_id: number;
  source: string;
  external_id: string;
  title: string;
  summary: string | null;
  url: string;
  severity: string | null;
  confidence: number | null;
  enriched_at: string | null;
};

function collapsePlainText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/`{1,3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimToSentence(value: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length <= max) {
    return normalized;
  }
  const clipped = normalized.slice(0, max).trim();
  const punctuation = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'));
  if (punctuation >= Math.floor(max * 0.55)) {
    return clipped.slice(0, punctuation + 1).trim();
  }
  const lastSpace = clipped.lastIndexOf(' ');
  if (lastSpace >= Math.floor(max * 0.7)) {
    return `${clipped.slice(0, lastSpace).trim()}...`;
  }
  return `${clipped}...`;
}

function fallbackEnrichment(row: DraftEventForEnrichment): {
  summary: string;
  impact: string;
  remedy: string[];
  model: string;
} {
  const severity = (row.severity ?? 'medium').toLowerCase() as 'low' | 'medium' | 'high';
  const summary = trimToSentence(
    collapsePlainText(row.summary ?? row.title) || collapsePlainText(row.title) || 'AI security incident requiring review.',
    700
  );
  const impact = buildFallbackIncidentImpact(row.title, row.summary ?? row.title, row.source, severity, row.confidence);
  const remedy = buildFallbackIncidentRemedy(row.title, row.summary ?? row.title);
  return { summary, impact, remedy, model: 'fallback-v1' };
}

async function enrichPublishedDraft(env: EnvBindings, draftId: number): Promise<void> {
  if (!env.DB) {
    return;
  }

  const row = await env.DB
    .prepare(
      `SELECT
         d.id AS draft_id,
         d.enriched_at,
         e.source,
         e.external_id,
         e.title,
         e.summary,
         e.url,
         e.severity,
         e.confidence
       FROM draft_posts d
       JOIN ingested_events e ON e.id = d.event_id
       WHERE d.id = ?1 AND d.status = 'published'
       LIMIT 1`
    )
    .bind(draftId)
    .first<DraftEventForEnrichment>();

  if (!row || row.enriched_at) {
    return;
  }

  let enrichment = null as Awaited<ReturnType<typeof llmEnrichIncident>>;
  try {
    enrichment = await llmEnrichIncident(env, {
      source: toSourceKind(row.source),
      externalId: row.external_id,
      title: row.title,
      url: row.url,
      summary: row.summary ?? '',
      publishedAt: null,
      severity: row.severity ?? undefined,
      confidence: row.confidence ?? undefined,
    });
  } catch {
    // Ignore provider/region failures and apply deterministic fallback rewrite.
    enrichment = null;
  }

  const finalEnrichment = enrichment ?? fallbackEnrichment(row);

  const now = new Date().toISOString();
  await env.DB
    .prepare(
      `UPDATE draft_posts
       SET enriched_summary = ?2,
           enriched_impact = ?3,
           enriched_remedy_json = ?4,
           enrichment_model = ?5,
           enriched_at = ?6
       WHERE id = ?1`
    )
    .bind(
      draftId,
      finalEnrichment.summary,
      finalEnrichment.impact,
      JSON.stringify(finalEnrichment.remedy),
      finalEnrichment.model,
      now
    )
    .run();
}

const schema = z.object({
  email: z.string().email().max(200),
  company: z.string().max(120).optional().or(z.literal('')).transform((value) => value ?? ''),
  role: z.string().max(120).optional().or(z.literal('')).transform((value) => value ?? ''),
  interests: z.string().max(240).optional().or(z.literal('')).transform((value) => value ?? ''),
  source: z.string().max(120).optional().or(z.literal('')),
  utmSource: z.string().max(120).optional().or(z.literal('')),
  utmMedium: z.string().max(120).optional().or(z.literal('')),
  utmCampaign: z.string().max(120).optional().or(z.literal('')),
  referrer: z.string().max(500).optional().or(z.literal('')),
  landingPath: z.string().max(300).optional().or(z.literal('')),
});

class MemoryStore {
  private items = new Map<string, WaitlistSignup>();

  upsert(signup: WaitlistSignup): { inserted: boolean } {
    const key = signup.email.trim().toLowerCase();
    const exists = this.items.has(key);
    this.items.set(key, signup);
    return { inserted: !exists };
  }
}

const memoryStore = new MemoryStore();

function normalize(form: Record<string, string | undefined>): WaitlistSignup {
  return {
    email: form.email?.trim() ?? '',
    company: form.company?.trim() || '',
    role: form.role?.trim() || '',
    interests: form.interests?.trim() ?? '',
    source: form.source?.trim() || undefined,
    utmSource: form.utmSource?.trim() || undefined,
    utmMedium: form.utmMedium?.trim() || undefined,
    utmCampaign: form.utmCampaign?.trim() || undefined,
    referrer: form.referrer?.trim() || undefined,
    landingPath: form.landingPath?.trim() || undefined,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toCsv(rows: SignupRow[]): string {
  const headers = [
    'email',
    'company',
    'role',
    'interests',
    'source',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'referrer',
    'landing_path',
    'created_at',
  ];

  const escapeCsv = (value: string | null): string => {
    const raw = value ?? '';
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replaceAll('"', '""')}"`;
    }
    return raw;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.email,
      row.company,
      row.role,
      row.interests,
      row.source,
      row.utm_source,
      row.utm_medium,
      row.utm_campaign,
      row.referrer,
      row.landing_path,
      row.created_at,
    ].map(escapeCsv).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function renderAdminPage(rows: SignupRow[]): string {
  const bodyRows = rows
    .map((row) => {
      const safe = {
        email: escapeHtml(row.email),
        company: escapeHtml(row.company),
        role: escapeHtml(row.role),
        interests: escapeHtml(row.interests),
        source: escapeHtml(row.source ?? ''),
        utm: escapeHtml([row.utm_source, row.utm_medium, row.utm_campaign].filter(Boolean).join(' / ')),
        created_at: escapeHtml(row.created_at),
      };
      return `<tr>
        <td>${safe.created_at}</td>
        <td>${safe.email}</td>
        <td>${safe.company}</td>
        <td>${safe.role}</td>
        <td>${safe.interests}</td>
        <td>${safe.source}</td>
        <td>${safe.utm}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signup Admin</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 13px; }
    th { background: #f5f5f5; text-align: left; }
    h1 { margin: 0 0 14px; }
    .actions { margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>Waitlist Signups</h1>
  <div class="actions">Use <code>/api/admin/signups?format=csv</code> for export.</div>
  <table>
    <thead>
      <tr>
        <th>Created At</th>
        <th>Email</th>
        <th>Company</th>
        <th>Role</th>
        <th>Interests</th>
        <th>Source</th>
        <th>UTM</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
}

async function saveSignup(db: D1Database | undefined, signup: WaitlistSignup): Promise<{ inserted: boolean }> {
  if (!db) {
    return memoryStore.upsert(signup);
  }

  const email = signup.email.toLowerCase();
  const exists = await db.prepare('SELECT 1 AS found FROM waitlist_signups WHERE email = ?1 LIMIT 1').bind(email).first();

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO waitlist_signups (
         email, company, role, interests, source, utm_source, utm_medium, utm_campaign, referrer, landing_path, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(email) DO UPDATE SET
         company = excluded.company,
         role = excluded.role,
         interests = excluded.interests,
         source = excluded.source,
         utm_source = excluded.utm_source,
         utm_medium = excluded.utm_medium,
         utm_campaign = excluded.utm_campaign,
         referrer = excluded.referrer,
         landing_path = excluded.landing_path`
    )
    .bind(
      email,
      signup.company,
      signup.role,
      signup.interests,
      signup.source ?? null,
      signup.utmSource ?? null,
      signup.utmMedium ?? null,
      signup.utmCampaign ?? null,
      signup.referrer ?? null,
      signup.landingPath ?? null,
      now
    )
    .run();

  return { inserted: !exists };
}

function toPayload(body: Record<string, string | File>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])
  );
}

async function parsePayload(c: Context<{ Bindings: EnvBindings }>): Promise<Record<string, string | undefined>> {
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await c.req.json()) as Record<string, string | undefined>;
  }
  const body = await c.req.parseBody();
  return toPayload(body as Record<string, string | File>);
}

function getAdminToken(c: Context<{ Bindings: EnvBindings }>): string | null {
  const authHeader = c.req.header('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

function isAdminAuthorized(c: Context<{ Bindings: EnvBindings }>): boolean {
  const expected = c.env.ADMIN_API_TOKEN;
  if (!expected) {
    return false;
  }
  const provided = getAdminToken(c);
  if (!provided) {
    return false;
  }
  return safeEqual(provided, expected);
}

type RateLimitResult = {
  allowed: boolean;
  retryAfterSec: number;
};

const rateLimitState = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = rateLimitState.get(key);

  if (!existing || now >= existing.resetAt) {
    rateLimitState.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { allowed: true, retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
}

function clientIp(c: Context<{ Bindings: EnvBindings }>): string {
  const header = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'unknown';
  return header.split(',')[0]?.trim() || 'unknown';
}

function runBackground(c: Context<{ Bindings: EnvBindings }>, promise: Promise<void>): Promise<void> {
  try {
    const ctx = c.executionCtx;
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(promise);
      return Promise.resolve();
    }
  } catch {
    // Test environment may not expose an execution context.
  }
  return promise;
}

async function sendEmailNotification(env: EnvBindings, signup: WaitlistSignup): Promise<void> {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL_TO) {
    return;
  }

  const interestLabel = signup.interests || '(not provided)';
  const payload = {
    from: 'AI Security Radar <alerts@aisecurityradar.com>',
    to: [env.NOTIFY_EMAIL_TO],
    subject: `New waitlist signup: ${signup.email}`,
    text: [
      `Email: ${signup.email}`,
      ...(signup.company ? [`Company: ${signup.company}`] : []),
      ...(signup.role ? [`Role: ${signup.role}`] : []),
      `Interests: ${interestLabel}`,
      `Source: ${signup.source ?? ''}`,
      `UTM: ${signup.utmSource ?? ''}/${signup.utmMedium ?? ''}/${signup.utmCampaign ?? ''}`,
    ].join('\n'),
  };

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function sendTelegramNotification(env: EnvBindings, signup: WaitlistSignup): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return;
  }

  const interestLabel = signup.interests || '(not provided)';
  const text = [
    'New waitlist signup',
    `Email: ${signup.email}`,
    ...(signup.company ? [`Company: ${signup.company}`] : []),
    ...(signup.role ? [`Role: ${signup.role}`] : []),
    `Risks: ${interestLabel}`,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}

async function notifySignup(env: EnvBindings, signup: WaitlistSignup): Promise<void> {
  await Promise.allSettled([
    sendEmailNotification(env, signup),
    sendTelegramNotification(env, signup),
  ]);
}

export function createApp() {
  const app = new Hono<{ Bindings: EnvBindings }>();

  app.use('*', async (c, next) => {
    await next();
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('X-Frame-Options', 'DENY');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    c.res.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    c.res.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com; connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/', async (c) => {
    const siteUrl = getSiteUrl(c);
    const incidents = await listIncidents(c.env.DB);
    const sample = toLandingSample(getIndexableIncidents(incidents)[0], siteUrl);
    const appName = c.env.APP_NAME ?? 'AI Security Incident Radar';
    return c.html(renderLandingPage(appName, c.env.GA_MEASUREMENT_ID, sample, siteUrl));
  });

  const renderIncidentsListing = async (c: Context<{ Bindings: EnvBindings }>, requestedPage: number) => {
    const incidents = getIndexableIncidents(await listIncidents(c.env.DB));
    const totalPages = Math.max(1, Math.ceil(incidents.length / INCIDENTS_PER_PAGE));
    if (requestedPage > totalPages) {
      return c.text('Incident page not found', 404);
    }

    const start = (requestedPage - 1) * INCIDENTS_PER_PAGE;
    const pageIncidents = incidents.slice(start, start + INCIDENTS_PER_PAGE);
    const prevPagePath = requestedPage > 1 ? incidentsPagePath(requestedPage - 1) : undefined;
    const nextPagePath = requestedPage < totalPages ? incidentsPagePath(requestedPage + 1) : undefined;
    return c.html(
      renderIncidentsPage(pageIncidents, {
        currentPage: requestedPage,
        totalPages,
        totalIncidents: incidents.length,
        prevPagePath,
        nextPagePath,
        siteUrl: getSiteUrl(c),
      })
    );
  };

  app.get('/incidents', async (c) => {
    const queryPage = c.req.query('page');
    if (queryPage && queryPage !== '1') {
      const parsedPage = parsePageNumber(queryPage);
      if (!parsedPage) {
        return c.text('Invalid page number', 404);
      }
      return c.redirect(incidentsPagePath(parsedPage), 301);
    }
    return renderIncidentsListing(c, 1);
  });

  app.get('/incidents/page/:page', async (c) => {
    const parsedPage = parsePageNumber(c.req.param('page'));
    if (!parsedPage) {
      return c.text('Invalid page number', 404);
    }
    if (parsedPage === 1) {
      return c.redirect('/incidents', 301);
    }
    return renderIncidentsListing(c, parsedPage);
  });

  app.get('/incidents/:slug', async (c) => {
    const slug = c.req.param('slug');
    const incidents = await listIncidents(c.env.DB);
    const incident = incidents.find((item) => item.slug === slug);
    if (!incident) {
      return c.text('Incident not found', 404);
    }
    return c.html(renderIncidentDetailPage(incident, incidents, getSiteUrl(c)));
  });

  app.get('/privacy', (c) => c.html(renderPrivacyPage(getSiteUrl(c))));
  app.get('/terms', (c) => c.html(renderTermsPage(getSiteUrl(c))));
  app.get('/security', (c) => c.html(renderSecurityPage(getSiteUrl(c))));
  app.get('/methodology', (c) => c.html(renderMethodologyPage(getSiteUrl(c))));
  app.get('/admin/ops', (c) => c.html(renderAdminOpsPage(getSiteUrl(c))));
  app.get('/admin/metrics', (c) => c.html(renderAdminMetricsPage(getSiteUrl(c))));

  app.get('/robots.txt', (c) => {
    const siteUrl = getSiteUrl(c);
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/admin',
      `Sitemap: ${siteUrl}/sitemap.xml`,
      '',
    ].join('\n');
    return c.body(body, 200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    });
  });

  app.get('/sitemap.xml', async (c) => {
    const siteUrl = getSiteUrl(c);
    const incidents = getIndexableIncidents(await listIncidents(c.env.DB));
    const nowIso = new Date().toISOString();
    const newestIncidentDate = incidents[0]?.sortDate;
    const parsedNewestIncidentDate = newestIncidentDate ? Date.parse(newestIncidentDate) : Number.NaN;
    const incidentsLastmod = Number.isNaN(parsedNewestIncidentDate) ? nowIso : new Date(parsedNewestIncidentDate).toISOString();
    const incidentListPages = Math.max(1, Math.ceil(incidents.length / INCIDENTS_PER_PAGE));
    const staticUrls: Array<{ path: string; lastmod: string }> = [
      { path: '/', lastmod: nowIso },
      { path: '/incidents', lastmod: incidentsLastmod },
      { path: '/methodology', lastmod: nowIso },
      { path: '/privacy', lastmod: nowIso },
      { path: '/terms', lastmod: nowIso },
      { path: '/security', lastmod: nowIso },
    ];
    const incidentsPaginationUrls = Array.from({ length: Math.max(0, incidentListPages - 1) }, (_, index) => ({
      path: `/incidents/page/${index + 2}`,
      lastmod: incidentsLastmod,
    }));
    const incidentUrls = incidents.map((incident) => {
      const parsedSort = Date.parse(incident.sortDate);
      const incidentLastmod = Number.isNaN(parsedSort) ? nowIso : new Date(parsedSort).toISOString();
      return { path: `/incidents/${incident.slug}`, lastmod: incidentLastmod };
    });

    const allUrls = [...staticUrls, ...incidentsPaginationUrls, ...incidentUrls];
    const entries = allUrls
      .map(
        (item) => `  <url>
    <loc>${siteUrl}${item.path}</loc>
    <lastmod>${item.lastmod}</lastmod>
  </url>`
      )
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
    return c.body(xml, 200, {
      'content-type': 'application/xml; charset=utf-8',
      // Keep cache short so newly published incidents appear quickly in sitemap consumers.
      'cache-control': 'public, max-age=60',
    });
  });

  app.get('/api/admin/signups', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '100'), 1), 500);
    const format = c.req.query('format') ?? 'json';

    const result = await c.env.DB
      .prepare(
        `SELECT email, company, role, interests, source, utm_source, utm_medium, utm_campaign, referrer, landing_path, created_at
         FROM waitlist_signups
         ORDER BY datetime(created_at) DESC
         LIMIT ?1`
      )
      .bind(limit)
      .all<SignupRow>();

    const rows = result.results ?? [];

    if (format === 'csv') {
      return c.body(toCsv(rows), 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="signups.csv"',
        'cache-control': 'no-store, max-age=0',
        pragma: 'no-cache',
      });
    }

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({ ok: true, count: rows.length, rows });
  });

  app.get('/api/admin/metrics', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const totalRow = await c.env.DB
      .prepare('SELECT COUNT(*) AS count FROM waitlist_signups')
      .first<MetricsCountRow>();

    const last7dRow = await c.env.DB
      .prepare("SELECT COUNT(*) AS count FROM waitlist_signups WHERE datetime(created_at) >= datetime('now', '-7 days')")
      .first<MetricsCountRow>();

    const dailyRows = await c.env.DB
      .prepare(
        `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
         FROM waitlist_signups
         GROUP BY substr(created_at, 1, 10)
         ORDER BY day DESC
         LIMIT 30`
      )
      .all<MetricsDailyRow>();

    const sourceRows = await c.env.DB
      .prepare(
        `SELECT COALESCE(NULLIF(source, ''), '(none)') AS source, COUNT(*) AS count
         FROM waitlist_signups
         GROUP BY COALESCE(NULLIF(source, ''), '(none)')
         ORDER BY count DESC
         LIMIT 20`
      )
      .all<MetricsSourceRow>();

    const utmRows = await c.env.DB
      .prepare(
        `SELECT COALESCE(NULLIF(utm_source, ''), '(none)') AS source, COUNT(*) AS count
         FROM waitlist_signups
         GROUP BY COALESCE(NULLIF(utm_source, ''), '(none)')
         ORDER BY count DESC
         LIMIT 20`
      )
      .all<MetricsSourceRow>();

    const sources = sourceRows.results ?? [];
    const utmSources = utmRows.results ?? [];
    const summary = {
      totalSignups: totalRow?.count ?? 0,
      signupsLast7d: last7dRow?.count ?? 0,
      topSource: sources[0]?.source ?? '(none)',
      topUtmSource: utmSources[0]?.source ?? '(none)',
    };

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({
      ok: true,
      summary,
      daily: dailyRows.results ?? [],
      sources,
      utmSources,
    });
  });

  app.get('/admin/signups', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.text('Unauthorized', 401);
    }

    if (!c.env.DB) {
      return c.text('DB not configured', 503);
    }

    const result = await c.env.DB
      .prepare(
        `SELECT email, company, role, interests, source, utm_source, utm_medium, utm_campaign, referrer, landing_path, created_at
         FROM waitlist_signups
         ORDER BY datetime(created_at) DESC
         LIMIT 200`
      )
      .all<SignupRow>();

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.html(renderAdminPage(result.results ?? []));
  });

  app.post('/api/admin/ingestion/run', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    const mode = c.req.query('mode') === 'cron-safe' ? 'cron' : 'manual';

    try {
      const result = await runIngestionPipeline(c.env, fetch, { mode, runId: `admin-${Date.now()}` });
      c.header('cache-control', 'no-store, max-age=0');
      c.header('pragma', 'no-cache');
      return c.json({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Ingestion run failed';
      c.header('cache-control', 'no-store, max-age=0');
      c.header('pragma', 'no-cache');
      return c.json({ ok: false, error: message }, 500);
    }
  });

  app.post('/api/admin/ingestion/normalize-summaries', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    try {
      const result = await normalizeLongSummaries(c.env.DB);
      c.header('cache-control', 'no-store, max-age=0');
      c.header('pragma', 'no-cache');
      return c.json({ ok: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Summary normalization failed';
      c.header('cache-control', 'no-store, max-age=0');
      c.header('pragma', 'no-cache');
      return c.json({ ok: false, error: message }, 500);
    }
  });

  app.get('/api/admin/drafts', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '50'), 1), 200);
    const rows = await c.env.DB
      .prepare(
        `SELECT
           d.id,
           d.event_id,
           d.status,
           d.slug,
           d.headline,
           d.linkedin_text,
           d.x_text,
           d.tags,
           d.approved_at,
           d.published_at,
           d.created_at,
           e.source,
           e.external_id,
           e.title,
           e.summary,
           e.severity,
           e.confidence,
           e.url,
           e.published_at
         FROM draft_posts d
         JOIN ingested_events e ON e.id = d.event_id
         ORDER BY datetime(COALESCE(e.published_at, d.created_at)) DESC
         LIMIT ?1`
      )
      .bind(limit)
      .all<Record<string, string | number | null>>();

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({ ok: true, count: rows.results?.length ?? 0, rows: rows.results ?? [] });
  });

  app.get('/api/admin/ingestions', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '50'), 1), 200);
    const rows = await c.env.DB
      .prepare(
        `SELECT
           e.id,
           e.source,
           e.external_id,
           e.title,
           e.summary,
           e.url,
           e.severity,
           e.confidence,
           e.published_at,
           e.created_at,
           d.id AS draft_id,
           d.status AS draft_status,
           d.slug AS draft_slug,
           d.linkedin_text AS draft_linkedin_text,
           d.x_text AS draft_x_text
         FROM ingested_events e
         LEFT JOIN draft_posts d ON d.event_id = e.id
         ORDER BY datetime(COALESCE(e.published_at, e.created_at)) DESC
         LIMIT ?1`
      )
      .bind(limit)
      .all<Record<string, string | number | null>>();

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({ ok: true, count: rows.results?.length ?? 0, rows: rows.results ?? [] });
  });

  app.post('/api/admin/ingestions/:id/create-draft', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ ok: false, error: 'Invalid ingestion id' }, 400);
    }

    try {
      const result = await createDraftFromIngestionEvent(c.env, id);
      c.header('cache-control', 'no-store, max-age=0');
      c.header('pragma', 'no-cache');
      return c.json({ ok: true, eventId: id, inserted: result.inserted, draftId: result.draftId });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create draft';
      if (message === 'Ingestion not found') {
        return c.json({ ok: false, error: message }, 404);
      }
      return c.json({ ok: false, error: message }, 500);
    }
  });

  app.post('/api/admin/drafts/:id/approve', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ ok: false, error: 'Invalid draft id' }, 400);
    }

    const current = await c.env.DB
      .prepare('SELECT id, status FROM draft_posts WHERE id = ?1 LIMIT 1')
      .bind(id)
      .first<{ id: number; status: string }>();

    if (!current) {
      return c.json({ ok: false, error: 'Draft not found' }, 404);
    }

    if (current.status === 'published') {
      return c.json({ ok: false, error: 'Draft already published' }, 409);
    }

    const now = new Date().toISOString();
    await c.env.DB
      .prepare(
        `UPDATE draft_posts
         SET status = 'approved',
             approved_at = COALESCE(approved_at, ?2)
         WHERE id = ?1`
      )
      .bind(id, now)
      .run();

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({ ok: true, id, status: 'approved' });
  });

  app.post('/api/admin/drafts/:id/publish', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ ok: false, error: 'Invalid draft id' }, 400);
    }

    const current = await c.env.DB
      .prepare('SELECT id, status, headline, slug FROM draft_posts WHERE id = ?1 LIMIT 1')
      .bind(id)
      .first<{ id: number; status: string; headline: string; slug: string | null }>();

    if (!current) {
      return c.json({ ok: false, error: 'Draft not found' }, 404);
    }

    if (current.status === 'draft') {
      return c.json({ ok: false, error: 'Draft must be approved before publishing' }, 409);
    }

    const now = new Date().toISOString();
    const slug = current.slug ?? `${slugify(current.headline || 'incident')}-${id}`;

    await c.env.DB
      .prepare(
        `UPDATE draft_posts
         SET status = 'published',
             slug = COALESCE(slug, ?2),
             approved_at = COALESCE(approved_at, ?3),
             published_at = COALESCE(published_at, ?3)
         WHERE id = ?1`
      )
      .bind(id, slug, now)
      .run();

    let enrichmentTriggered = false;
    let enrichmentError: string | null = null;
    try {
      await enrichPublishedDraft(c.env, id);
      enrichmentTriggered = true;
    } catch (error) {
      enrichmentTriggered = true;
      enrichmentError = error instanceof Error ? error.message : 'enrichment failed';
    }

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({ ok: true, id, status: 'published', slug, enrichmentTriggered, enrichmentError });
  });

  app.post('/api/admin/ingestion/reset', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const deleteDrafts = await c.env.DB.prepare('DELETE FROM draft_posts').run();
    const deleteEvents = await c.env.DB.prepare('DELETE FROM ingested_events').run();

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({
      ok: true,
      deletedDrafts: deleteDrafts.meta?.changes ?? 0,
      deletedEvents: deleteEvents.meta?.changes ?? 0,
    });
  });

  app.post('/api/admin/incidents/clear', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const cleared = await c.env.DB
      .prepare(
        `UPDATE draft_posts
         SET status = 'approved',
             published_at = NULL,
             slug = NULL
         WHERE status = 'published'`
      )
      .run();

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({ ok: true, cleared: cleared.meta?.changes ?? 0 });
  });

  app.post('/api/admin/incidents/:id/remove', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id <= 0) {
      return c.json({ ok: false, error: 'Invalid incident id' }, 400);
    }

    const existing = await c.env.DB
      .prepare('SELECT id, status FROM draft_posts WHERE id = ?1 LIMIT 1')
      .bind(id)
      .first<{ id: number; status: string }>();

    if (!existing) {
      return c.json({ ok: false, error: 'Incident not found' }, 404);
    }

    if (existing.status !== 'published') {
      return c.json({ ok: false, error: 'Incident is not published' }, 409);
    }

    await c.env.DB
      .prepare(
        `UPDATE draft_posts
         SET status = 'approved',
             published_at = NULL,
             slug = NULL
         WHERE id = ?1`
      )
      .bind(id)
      .run();

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json({ ok: true, id, status: 'approved' });
  });

  app.post('/api/waitlist', async (c) => {
    const ip = clientIp(c);
    const rate = checkRateLimit(`waitlist:${ip}`, 8, 60_000);
    if (!rate.allowed) {
      c.header('retry-after', String(rate.retryAfterSec));
      return c.json({ ok: false, error: 'Too many requests. Please retry shortly.' }, 429);
    }

    const payload = await parsePayload(c);

    const parsed = schema.safeParse(normalize(payload));
    if (!parsed.success) {
      return c.json(
        { ok: false, error: 'Invalid input', details: parsed.error.issues.map((i) => i.path.join('.')) },
        400
      );
    }

    const result = await saveSignup(c.env.DB, parsed.data);

    if (result.inserted) {
      const notifyPromise = notifySignup(c.env, parsed.data);
      await runBackground(c, notifyPromise);
    }

    c.header('cache-control', 'no-store, max-age=0');
    c.header('pragma', 'no-cache');
    return c.json(
      {
        ok: true,
        status: result.inserted ? 'joined' : 'already_joined',
      },
      result.inserted ? 201 : 200
    );
  });

  return app;
}
