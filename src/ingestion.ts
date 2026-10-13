import type { EnvBindings } from './app';

export type SourceEvent = {
  source: 'hn' | 'nvd' | 'rss' | 'ghsa' | 'cisa_kev' | 'euvd';
  externalId: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  sourceSeverity?: 'low' | 'medium' | 'high';
  cveId?: string;
  updatedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type StoredEvent = SourceEvent & {
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  fingerprint: string;
};

type DraftPost = {
  status: 'draft' | 'published';
  headline: string;
  linkedinText: string;
  xText: string;
  tags: string;
  approvedAt: string | null;
  publishedAt: string | null;
  slug: string | null;
};

export type IngestionMode = 'cron' | 'manual';

export type IngestionRunOptions = {
  mode?: IngestionMode;
  runId?: string;
  backfill?: { from: string; to: string; sources: SourceEvent['source'][] };
};

export type IngestionStopReason = 'completed' | 'runtime_budget' | 'event_budget' | 'db_budget';

export type IngestionSourceStats = {
  fetched: number;
  eligible: number;
  processed: number;
  inserted: number;
  deduped: number;
  queued: number;
  errors: number;
  rejected: number;
};

export type IngestionRunResult = {
  status: 'healthy' | 'degraded' | 'failed' | 'locked';
  warnings: string[];
  mode: IngestionMode;
  lockSkipped: boolean;
  stopReason: IngestionStopReason;
  fetched: number;
  relevant: number;
  processed: number;
  inserted: number;
  deduped: number;
  queuedForNextRun: number;
  draftsCreated: number;
  llmDedupeCalls: number;
  llmEnrichCalls: number;
  sourceStats: Record<SourceEvent['source'], IngestionSourceStats>;
  errors: string[];
};

export type RuntimeCaps = {
  maxProcessEvents: number;
  maxDbWrites: number;
  maxRuntimeMs: number;
  fetchTimeoutMs: number;
  hnMaxItems: number;
  cisaMaxItemsPerRun: number;
  euvdMaxItemsPerRun: number;
  ghsaMaxItemsPerRun: number;
  rssMaxItemsPerFeed: number;
  nvdResultsPerKeyword: number;
  llmDedupeMaxCalls: number;
  llmEnrichMaxCalls: number;
};

const SOURCE_ORDER: SourceEvent['source'][] = ['nvd', 'cisa_kev', 'euvd', 'ghsa', 'rss', 'hn'];
const DEFAULT_AUTO_PUBLISH_TRUSTED_SOURCES = SOURCE_ORDER.join(',');
const DEFAULT_AUTO_PUBLISH_MIN_CONFIDENCE = 0.45;

const AI_TERMS = [
  'artificial intelligence',
  'generative ai',
  'genai',
  'llm',
  'large language model',
  'machine learning',
  'foundation model',
  'chatgpt',
  'claude',
  'copilot',
  'gemini',
  'anthropic',
  'openai',
  'prompt injection',
  'jailbreak',
  'ai agent',
  'ai assistant',
  'langchain',
  'llamaindex',
  'mindsdb',
  'keras',
  'fickling',
  'picklescan',
  'hugging face',
  'model weights',
  'mlflow', 'pytorch', 'tensorflow', 'onnx', 'vllm', 'sglang', 'ollama', 'langflow', 'litellm', 'opennlp', 'agno',
];

const SECURITY_TERMS = [
  'security',
  'vulnerability',
  'cve',
  'breach',
  'remote code execution',
  'arbitrary code execution',
  'rce',
  'exploit',
  'malware',
  'compromise',
  'leak',
  'prompt injection',
  'jailbreak',
  'supply chain',
  'exfiltration',
  'account takeover',
];

const HN_INCIDENT_TERMS = [
  'cve',
  'vulnerability',
  'exploit',
  'breach',
  'malware',
  'prompt injection',
  'jailbreak',
  'data leak',
  'exfiltration',
  'compromise',
  'account takeover',
  'rce',
  'zero-day',
];

const HN_NOISE_TERMS = [
  'show hn',
  'ask hn',
  'who is hiring',
  'launch',
  'released',
  'release',
  'benchmark',
  'paper',
  'tutorial',
  'course',
  'job',
  'hiring',
];

const HIGH_SEVERITY_TERMS = ['remote code execution', 'arbitrary code execution', 'critical', 'rce', 'zero-day', 'breach', 'exfiltration', 'account takeover'];

const STORED_SUMMARY_MAX_CHARS = 380;
const GHSA_TITLE_MAX_CHARS = 220;
const GHSA_SUMMARY_MAX_CHARS = 380;
const GHSA_EXCERPT_MAX_CHARS = 170;
const NORMALIZE_SUMMARY_THRESHOLD_CHARS = 700;

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function clampDurationMs(value: string | undefined, fallback: number, min: number, max: number): number {
  return clampInt(value, fallback, min, max);
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  return fallback;
}

export function resolveRuntimeCaps(env: EnvBindings, mode: IngestionMode = 'manual'): RuntimeCaps {
  const isCron = mode === 'cron';
  const cronDisableLlmDedupe = parseBool(env.INGEST_CRON_DISABLE_LLM_DEDUPE, true);
  const llmDedupeMaxCalls = clampInt(env.LLM_DEDUPE_MAX_CALLS, 6, 0, 12);
  return {
    maxProcessEvents: isCron
      ? clampInt(env.INGEST_CRON_MAX_PROCESS_EVENTS, 60, 1, 300)
      : clampInt(undefined, 200, 50, 500),
    maxDbWrites: isCron
      ? clampInt(env.INGEST_CRON_MAX_DB_WRITES, 600, 1, 1500)
      : clampInt(undefined, 600, 100, 1500),
    maxRuntimeMs: isCron
      ? clampDurationMs(env.INGEST_CRON_MAX_RUNTIME_MS, 20_000, 1, 55_000)
      : 45_000,
    fetchTimeoutMs: isCron
      ? clampDurationMs(env.INGEST_CRON_FETCH_TIMEOUT_MS, 8_000, 1, 20_000)
      : 12_000,
    hnMaxItems: clampInt(env.HN_MAX_ITEMS, 8, 0, 20),
    cisaMaxItemsPerRun: clampInt(env.INGEST_CISA_MAX_ITEMS_PER_RUN, 80, 5, 250),
    euvdMaxItemsPerRun: clampInt(env.INGEST_EUVD_MAX_ITEMS_PER_RUN, 80, 5, 250),
    ghsaMaxItemsPerRun: clampInt(env.INGEST_GHSA_MAX_ITEMS_PER_RUN, 40, 5, 120),
    rssMaxItemsPerFeed: clampInt(env.INGEST_RSS_MAX_ITEMS_PER_FEED, 20, 2, 80),
    nvdResultsPerKeyword: clampInt(env.INGEST_NVD_RESULTS_PER_KEYWORD, 100, 2, 200),
    llmDedupeMaxCalls: isCron && cronDisableLlmDedupe ? 0 : llmDedupeMaxCalls,
    llmEnrichMaxCalls: clampInt(env.LLM_ENRICH_MAX_CALLS, 2, 0, 3),
  };
}

function stripTags(input: string): string {
  return input.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(input: string): string {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match || !match[1]) {
    return '';
  }
  return decodeEntities(stripTags(match[1]));
}

function extractAtomLink(block: string): string {
  const hrefMatch = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
  if (hrefMatch?.[1]) {
    return hrefMatch[1].trim();
  }
  return extractTag(block, 'link');
}

function normalizeExternalUrl(url: string, baseUrl: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    return '';
  }
  try {
    const resolved = new URL(trimmed, baseUrl);
    return resolved.toString();
  } catch {
    return trimmed;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function stripMarkdownNoise(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/[*_~]/g, ' ');
}

function trimToSentence(value: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length <= max) {
    return normalized;
  }
  const clipped = normalized.slice(0, max).trim();
  const punctuation = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'));
  if (punctuation >= Math.floor(max * 0.45)) {
    return clipped.slice(0, punctuation + 1).trim();
  }
  const lastSpace = clipped.lastIndexOf(' ');
  if (lastSpace >= Math.floor(max * 0.6)) {
    return `${clipped.slice(0, lastSpace).trim()}...`;
  }
  return `${clipped}...`;
}

function summaryCompareKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function compactSummaryText(value: string, maxChars = STORED_SUMMARY_MAX_CHARS): string {
  const plain = normalizeWhitespace(stripTags(stripMarkdownNoise(value)));
  if (!plain) {
    return '';
  }
  return trimToSentence(plain, Math.max(80, maxChars));
}

function firstSentence(value: string, maxChars: number): string {
  const compact = compactSummaryText(value, maxChars);
  if (!compact) {
    return '';
  }
  const sentenceMatch = compact.match(/^(.+?[.!?])(?:\s|$)/);
  return sentenceMatch?.[1]?.trim() ?? compact;
}

function normalizeStoredSummary(value: string, maxChars = STORED_SUMMARY_MAX_CHARS): string {
  const compact = compactSummaryText(value, maxChars);
  if (compact) {
    return compact;
  }
  return trimToSentence(normalizeWhitespace(value), maxChars);
}

export function summarizeGitHubAdvisory(
  summary: string,
  description?: string,
  maxChars = GHSA_SUMMARY_MAX_CHARS
): string {
  const headline = compactSummaryText(summary, Math.min(maxChars, GHSA_TITLE_MAX_CHARS));
  const excerpt = firstSentence(description ?? '', GHSA_EXCERPT_MAX_CHARS);
  if (!headline) {
    return normalizeStoredSummary(description ?? '', maxChars);
  }

  const headlineKey = summaryCompareKey(headline);
  const excerptKey = summaryCompareKey(excerpt);
  const shouldAppendExcerpt = Boolean(
    excerpt &&
    excerptKey &&
    headlineKey &&
    !headlineKey.includes(excerptKey) &&
    !excerptKey.includes(headlineKey)
  );

  return normalizeStoredSummary(shouldAppendExcerpt ? `${headline} ${excerpt}` : headline, maxChars);
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
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

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => containsTerm(text, term));
}

function countMatchingTerms(text: string, terms: string[]): number {
  return terms.filter((term) => containsTerm(text, term)).length;
}

function classificationSummary(summary: string, source: SourceEvent['source']): string {
  if (source !== 'ghsa') return summary;
  return summary
    .replace(/(?:^|\n)#{1,6}\s*(?:credits|acknowledg\w*|references|discovery)[^\n]*\n[\s\S]*?(?=\n#{1,6}\s|$)/gi, ' ')
    .replace(/[^.!?\n]*(?=\b(?:claude|chatgpt|copilot|openai)\b)[^.!?\n]*(?:coding agent|discovered|reported|alerted|identified|generated|reviewed)[^.!?\n]*[.!?\n]/gi, ' ');
}

export function isLikelyAiSecurityIncident(title: string, summary: string, source: SourceEvent['source']): boolean {
  const haystack = `${title} ${classificationSummary(summary, source)}`.toLowerCase();
  const aiHits = countMatchingTerms(haystack, AI_TERMS);
  const securityHits = countMatchingTerms(haystack, SECURITY_TERMS);
  const hasAiSignal = aiHits > 0;
  const hasSecuritySignal = securityHits > 0;

  if (source === 'hn') {
    const hasIncidentSignal = hasAnyTerm(haystack, HN_INCIDENT_TERMS);
    const hasNoiseSignal = hasAnyTerm(haystack, HN_NOISE_TERMS);
    return hasAiSignal && hasIncidentSignal && !hasNoiseSignal;
  }

  if (source === 'rss') {
    return hasAiSignal && hasSecuritySignal;
  }

  if (source === 'nvd') {
    return hasAiSignal && hasSecuritySignal;
  }

  // GHSA, CISA KEV, and EUVD entries are security-focused; require AI context.
  return hasAiSignal;
}

export function scoreIncidentRelevance(title: string, summary: string, source: SourceEvent['source']): number {
  if (!isLikelyAiSecurityIncident(title, summary, source)) {
    return 0;
  }
  const haystack = `${title} ${classificationSummary(summary, source)}`.toLowerCase();
  const aiHits = countMatchingTerms(haystack, AI_TERMS);
  const securityHits = countMatchingTerms(haystack, SECURITY_TERMS);
  const weighted = Math.min(1, (aiHits * 0.6 + securityHits * 0.4) / 4);
  return Math.max(0.4, weighted);
}

function parseDateSafe(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

export function isEventRecent(publishedAt: string | null, maxAgeDays: number, nowMs: number): boolean {
  const publishedMs = parseDateSafe(publishedAt);
  if (!publishedMs) {
    return false;
  }
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return publishedMs <= nowMs + 86400000 && nowMs - publishedMs <= maxAgeMs;
}

function inferSeverity(title: string, summary: string): 'low' | 'medium' | 'high' {
  const haystack = `${title} ${summary}`.toLowerCase();
  let inferred: 'low' | 'medium' | 'high' = 'low';
  for (const term of HIGH_SEVERITY_TERMS) {
    if (containsTerm(haystack, term)) {
      inferred = 'high';
      break;
    }
  }
  if (
    inferred === 'low' &&
    (containsTerm(haystack, 'cve') || containsTerm(haystack, 'vulnerability') || containsTerm(haystack, 'exploit'))
  ) {
    inferred = 'medium';
  }
  return inferred;
}

function resolveSeverity(title: string, summary: string, sourceSeverity: 'low' | 'medium' | 'high' | undefined): 'low' | 'medium' | 'high' {
  const inferred = inferSeverity(title, summary);
  if (!sourceSeverity) {
    return inferred;
  }
  return sourceSeverity;
}

function severityRank(value: string): number {
  if (value === 'high') {
    return 3;
  }
  if (value === 'medium') {
    return 2;
  }
  return 1;
}

function minSeverity(env: EnvBindings): 'low' | 'medium' | 'high' {
  const raw = (env.AUTO_PUBLISH_MIN_SEVERITY ?? 'high').toLowerCase();
  if (raw === 'low' || raw === 'medium' || raw === 'high') {
    return raw;
  }
  return 'high';
}

function minAutoPublishConfidence(env: EnvBindings): number {
  const raw = Number(env.AUTO_PUBLISH_MIN_CONFIDENCE ?? String(DEFAULT_AUTO_PUBLISH_MIN_CONFIDENCE));
  if (!Number.isFinite(raw)) {
    return DEFAULT_AUTO_PUBLISH_MIN_CONFIDENCE;
  }
  return Math.min(0.99, Math.max(0, raw));
}

function trustedSources(env: EnvBindings): Set<string> {
  const raw = env.AUTO_PUBLISH_TRUSTED_SOURCES ?? DEFAULT_AUTO_PUBLISH_TRUSTED_SOURCES;
  return new Set(
    raw
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function shouldAutoPublish(event: StoredEvent, env: EnvBindings): boolean {
  const allowedSources = trustedSources(env);
  const sourceAllowed = allowedSources.has(event.source.toLowerCase());
  if (!sourceAllowed) {
    return false;
  }
  if (event.confidence < minAutoPublishConfidence(env)) {
    return false;
  }
  return severityRank(event.severity) >= severityRank(minSeverity(env));
}

export async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function toStoredEvent(input: SourceEvent): Promise<StoredEvent | null> {
  const relevance = scoreIncidentRelevance(input.title, input.summary, input.source);
  if (relevance < 0.4) {
    return null;
  }

  const basis = normalizeWhitespace(`${input.source}|${input.externalId.toLowerCase()}`);
  const fingerprint = await sha256Hex(basis);
  const normalizedSummary = normalizeStoredSummary(input.summary, STORED_SUMMARY_MAX_CHARS) || input.title;
  return {
    ...input,
    summary: normalizedSummary,
    severity: resolveSeverity(input.title, input.summary, input.sourceSeverity),
    confidence: Math.max(0.45, Math.min(0.99, relevance)),
    fingerprint,
  };
}

function extractBlocks(xml: string, tag: 'item' | 'entry'): string[] {
  const regex = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi');
  return xml.match(regex) ?? [];
}

export function parseRssOrAtom(xml: string, sourceUrl: string): SourceEvent[] {
  const items: SourceEvent[] = [];
  const isAtom = /<feed[\s>]/i.test(xml);

  if (isAtom) {
    for (const entry of extractBlocks(xml, 'entry')) {
      const title = normalizeWhitespace(extractTag(entry, 'title'));
      const summary = normalizeWhitespace(
        extractTag(entry, 'summary') || extractTag(entry, 'content') || extractTag(entry, 'description')
      );
      const url = normalizeExternalUrl(extractAtomLink(entry), sourceUrl);
      const externalId = extractTag(entry, 'id') || url || title;
      const publishedAt = extractTag(entry, 'published') || extractTag(entry, 'updated') || null;
      if (title && url) {
        items.push({
          source: 'rss',
          externalId,
          title,
          url,
          summary,
          publishedAt,
        });
      }
    }
    return items;
  }

  for (const item of extractBlocks(xml, 'item')) {
    const title = normalizeWhitespace(extractTag(item, 'title'));
    const summary = normalizeWhitespace(extractTag(item, 'description') || extractTag(item, 'content:encoded'));
    const url = normalizeExternalUrl(extractTag(item, 'link'), sourceUrl);
    const externalId = extractTag(item, 'guid') || url || title;
    const publishedAt = extractTag(item, 'pubDate') || null;
    if (title && url) {
      items.push({
        source: 'rss',
        externalId,
        title,
        url,
        summary,
        publishedAt,
      });
    }
  }

  return items;
}

export type NormalizeSummariesResult = {
  scannedEvents: number;
  updatedEvents: number;
  scannedDraftSummaries: number;
  updatedDraftSummaries: number;
  unchanged: number;
  thresholdChars: number;
  maxChars: number;
};

type LongEventSummaryRow = {
  id: number;
  summary: string | null;
};

type LongDraftSummaryRow = {
  id: number;
  enriched_summary: string | null;
};

export async function normalizeLongSummaries(
  db: D1Database,
  input?: { thresholdChars?: number; maxChars?: number }
): Promise<NormalizeSummariesResult> {
  const thresholdChars = Math.min(Math.max(input?.thresholdChars ?? NORMALIZE_SUMMARY_THRESHOLD_CHARS, 180), 20_000);
  const maxChars = Math.min(Math.max(input?.maxChars ?? STORED_SUMMARY_MAX_CHARS, 120), 1_000);
  let scannedEvents = 0;
  let updatedEvents = 0;
  let scannedDraftSummaries = 0;
  let updatedDraftSummaries = 0;

  const longEventRows = await db
    .prepare(
      `SELECT id, summary
       FROM ingested_events
       WHERE summary IS NOT NULL
         AND length(summary) > ?1`
    )
    .bind(thresholdChars)
    .all<LongEventSummaryRow>();

  for (const row of longEventRows.results ?? []) {
    scannedEvents += 1;
    const current = row.summary ?? '';
    const normalized = normalizeStoredSummary(current, maxChars);
    if (!normalized || normalized === current) {
      continue;
    }
    const result = await db
      .prepare(
        `UPDATE ingested_events
         SET summary = ?1
         WHERE id = ?2`
      )
      .bind(normalized, row.id)
      .run();
    if ((result.meta?.changes ?? 0) > 0) {
      updatedEvents += 1;
    }
  }

  const longDraftRows = await db
    .prepare(
      `SELECT id, enriched_summary
       FROM draft_posts
       WHERE enriched_summary IS NOT NULL
         AND length(enriched_summary) > ?1`
    )
    .bind(thresholdChars)
    .all<LongDraftSummaryRow>();

  for (const row of longDraftRows.results ?? []) {
    scannedDraftSummaries += 1;
    const current = row.enriched_summary ?? '';
    const normalized = normalizeStoredSummary(current, maxChars);
    if (!normalized || normalized === current) {
      continue;
    }
    const result = await db
      .prepare(
        `UPDATE draft_posts
         SET enriched_summary = ?1
         WHERE id = ?2`
      )
      .bind(normalized, row.id)
      .run();
    if ((result.meta?.changes ?? 0) > 0) {
      updatedDraftSummaries += 1;
    }
  }

  return {
    scannedEvents,
    updatedEvents,
    scannedDraftSummaries,
    updatedDraftSummaries,
    unchanged: scannedEvents + scannedDraftSummaries - updatedEvents - updatedDraftSummaries,
    thresholdChars,
    maxChars,
  };
}

export function buildDraftPost(event: StoredEvent, nowIso: string, autoPublish: boolean): DraftPost {
  const headline = shorten(`AI security incident: ${event.title}`, 110);
  const issue = shorten(event.summary || event.title, 220);
  const sourceLine = `Source: ${event.url}`;
  const tags = '#AISecurity #CyberSecurity #RiskManagement';

  const linkedinText = [
    headline,
    '',
    `Issue: ${issue}`,
    `Severity: ${event.severity.toUpperCase()} | Confidence: ${(event.confidence * 100).toFixed(0)}%`,
    'Suggested next step: validate exposure scope, patch or mitigate, and brief stakeholders.',
    sourceLine,
    '',
    tags,
  ].join('\n');

  const xText = shorten(
    `${headline}\n${shorten(issue, 140)}\n${sourceLine}\n${tags}`,
    280
  );

  return {
    status: autoPublish ? 'published' : 'draft',
    headline,
    linkedinText,
    xText,
    tags,
    approvedAt: autoPublish ? nowIso : null,
    publishedAt: autoPublish ? nowIso : null,
    slug: autoPublish ? `${slugify(headline)}-${event.externalId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 96) : null,
  };
}

export async function storeEvent(db: D1Database, event: StoredEvent, nowIso: string): Promise<{ eventId: number; inserted: boolean }> {
  const candidate = event.cveId ?? event.externalId;
  const canonical = /^CVE-\d{4}-\d+$/i.test(candidate) ? candidate.toUpperCase() : null;
  const existing = await db.prepare(`SELECT id,source FROM ingested_events WHERE (source=?1 AND external_id=?2)
    OR (canonical_id IS NOT NULL AND canonical_id=?3) OR url=?4
    ORDER BY (source=?1 AND external_id=?2) DESC LIMIT 1`)
    .bind(event.source,event.externalId,canonical,event.url).first<{ id:number; source:string }>();
  if (existing) {
    if (existing.source === event.source) await db.prepare(`UPDATE ingested_events SET title=?2,summary=?3,
      severity=?4,confidence=?5,source_updated_at=?6,source_metadata_json=?7,canonical_id=COALESCE(canonical_id,?8) WHERE id=?1`)
      .bind(existing.id,event.title,event.summary,event.severity,event.confidence,event.updatedAt ?? null,
        JSON.stringify(event.metadata ?? {}),canonical).run();
    else if (event.severity === 'high') await db.prepare("UPDATE ingested_events SET severity='high' WHERE id=?1").bind(existing.id).run();
    return { eventId: existing.id, inserted: false };
  }
  await db.prepare(`INSERT INTO ingested_events
    (source,external_id,title,url,summary,published_at,severity,confidence,fingerprint,created_at,canonical_id,source_updated_at,source_metadata_json)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13) ON CONFLICT DO NOTHING`)
    .bind(event.source,event.externalId,event.title,event.url,event.summary,event.publishedAt,event.severity,
      event.confidence,event.fingerprint,nowIso,canonical,event.updatedAt ?? null,JSON.stringify(event.metadata ?? {})).run();
  const row = await db.prepare('SELECT id FROM ingested_events WHERE source=?1 AND external_id=?2')
    .bind(event.source,event.externalId).first<{ id:number }>();
  if (!row) throw new Error('Event insert/select failed');
  return { eventId: row.id, inserted: true };
}

export async function storeDraft(
  db: D1Database,
  eventId: number,
  draft: DraftPost,
  nowIso: string
): Promise<{ inserted: boolean; draftId: number | null; status: string }> {
  const insertedResult = await db
    .prepare(
      `INSERT INTO draft_posts (event_id, status, headline, linkedin_text, x_text, tags, approved_at, published_at, slug, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(event_id) DO NOTHING`
    )
    .bind(
      eventId,
      draft.status,
      draft.headline,
      draft.linkedinText,
      draft.xText,
      draft.tags,
      draft.approvedAt,
      draft.publishedAt,
      draft.slug,
      nowIso
    )
    .run();

  const row = await db
    .prepare('SELECT id,status FROM draft_posts WHERE event_id = ?1 LIMIT 1')
    .bind(eventId)
    .first<{ id: number; status: string }>();

  return {
    inserted: Boolean((insertedResult.meta?.changes ?? 0) > 0),
    draftId: row?.id ?? null,
    status: row?.status ?? draft.status,
  };
}

export async function createDraftFromIngestionEvent(
  env: EnvBindings,
  eventId: number
): Promise<{ inserted: boolean; draftId: number | null }> {
  if (!env.DB) {
    throw new Error('DB not configured');
  }

  const row = await env.DB
    .prepare(
      `SELECT source, external_id, title, url, summary, published_at, severity, confidence, fingerprint
       FROM ingested_events
       WHERE id = ?1
       LIMIT 1`
    )
    .bind(eventId)
    .first<{
      source: SourceEvent['source'];
      external_id: string;
      title: string;
      url: string;
      summary: string | null;
      published_at: string | null;
      severity: 'low' | 'medium' | 'high' | null;
      confidence: number | null;
      fingerprint: string | null;
    }>();

  if (!row) {
    throw new Error('Ingestion not found');
  }

  const event: StoredEvent = {
    source: row.source,
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    summary: row.summary ?? '',
    publishedAt: row.published_at,
    severity: row.severity ?? inferSeverity(row.title, row.summary ?? ''),
    confidence: row.confidence ?? scoreIncidentRelevance(row.title, row.summary ?? '', row.source),
    fingerprint: row.fingerprint ?? '',
  };

  const nowIso = new Date().toISOString();
  const draft = buildDraftPost(event, nowIso, false);
  return storeDraft(env.DB, eventId, draft, nowIso);
}

export { runDurableIngestion as runIngestionPipeline } from './ingestion-runtime';
