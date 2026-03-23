import type { EnvBindings } from './app';
import { llmDuplicateDecision } from './llm';

export type SourceEvent = {
  source: 'hn' | 'nvd' | 'rss' | 'ghsa' | 'cisa_kev' | 'euvd';
  externalId: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
  sourceSeverity?: 'low' | 'medium' | 'high';
};

type StoredEvent = SourceEvent & {
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  fingerprint: string;
};

type StoredEventRow = {
  id: number;
  source: string;
  external_id: string;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
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
};

export type IngestionRunResult = {
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

type FetchLike = typeof fetch;

type IngestionStateRow = {
  key: string;
  value: string;
  updated_at: string;
};

type SourceFetchResult = {
  events: SourceEvent[];
  errors: string[];
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

const HIGH_SEVERITY_TERMS = ['critical', 'rce', 'zero-day', 'breach', 'exfiltration', 'account takeover'];

const DEFAULT_RSS_FEEDS = [
  'https://www.kb.cert.org/vuls/atomfeed/',
  'https://cert.europa.eu/publications/security-advisories-rss',
  'https://cert.europa.eu/publications/threat-intelligence-rss',
  'https://cloud.google.com/feeds/google-cloud-security-bulletins.xml',
  'https://aws.amazon.com/security/security-bulletins/rss/feed/',
  'https://ubuntu.com/security/notices/rss.xml',
];

const STORED_SUMMARY_MAX_CHARS = 380;
const GHSA_TITLE_MAX_CHARS = 220;
const GHSA_SUMMARY_MAX_CHARS = 380;
const GHSA_EXCERPT_MAX_CHARS = 170;
const NORMALIZE_SUMMARY_THRESHOLD_CHARS = 700;
const CRON_LOCK_KEY = 'lock:cron';
const CRON_LOCK_TTL_MS = 55 * 60 * 1000;
const RUN_STATE_KEY_PREFIX = 'run:latest:';

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
      ? clampInt(env.INGEST_CRON_MAX_DB_WRITES, 180, 1, 900)
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
    nvdResultsPerKeyword: clampInt(env.INGEST_NVD_RESULTS_PER_KEYWORD, 6, 2, 20),
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

function toIsoFromUnixSeconds(unixSeconds: number | undefined): string | null {
  if (!unixSeconds || Number.isNaN(unixSeconds)) {
    return null;
  }
  return new Date(unixSeconds * 1000).toISOString();
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

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isLikelyAiSecurityIncident(title: string, summary: string, source: SourceEvent['source']): boolean {
  const haystack = `${title} ${summary}`.toLowerCase();
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
  const haystack = `${title} ${summary}`.toLowerCase();
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

function buildRunId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptySourceStats(): IngestionSourceStats {
  return {
    fetched: 0,
    eligible: 0,
    processed: 0,
    inserted: 0,
    deduped: 0,
    queued: 0,
    errors: 0,
  };
}

function initSourceStats(): Record<SourceEvent['source'], IngestionSourceStats> {
  return {
    hn: emptySourceStats(),
    nvd: emptySourceStats(),
    rss: emptySourceStats(),
    ghsa: emptySourceStats(),
    cisa_kev: emptySourceStats(),
    euvd: emptySourceStats(),
  };
}

function cursorStateKey(source: SourceEvent['source']): string {
  return `cursor:${source}`;
}

function runStateKey(mode: IngestionMode): string {
  return `${RUN_STATE_KEY_PREFIX}${mode}`;
}

function sourceMaxItems(source: SourceEvent['source'], caps: RuntimeCaps, rssFeedCount: number): number {
  if (source === 'hn') {
    return caps.hnMaxItems;
  }
  if (source === 'cisa_kev') {
    return caps.cisaMaxItemsPerRun;
  }
  if (source === 'euvd') {
    return caps.euvdMaxItemsPerRun;
  }
  if (source === 'ghsa') {
    return caps.ghsaMaxItemsPerRun;
  }
  if (source === 'rss') {
    return Math.max(1, rssFeedCount) * caps.rssMaxItemsPerFeed;
  }
  return caps.nvdResultsPerKeyword * 4;
}

function withFetchTimeout(fetchFn: FetchLike, timeoutMs: number): FetchLike {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchFn(input, { ...(init ?? {}), signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
}

async function getIngestionState(db: D1Database, key: string): Promise<IngestionStateRow | null> {
  return db
    .prepare('SELECT key, value, updated_at FROM ingestion_state WHERE key = ?1 LIMIT 1')
    .bind(key)
    .first<IngestionStateRow>();
}

async function putIngestionState(db: D1Database, key: string, value: string, nowIso: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ingestion_state (key, value, updated_at)
       VALUES (?1, ?2, ?3)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`
    )
    .bind(key, value, nowIso)
    .run();
}

async function deleteIngestionState(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM ingestion_state WHERE key = ?1').bind(key).run();
}

async function acquireCronLock(db: D1Database, nowIso: string, lockValue: string): Promise<{ acquired: boolean; error?: string }> {
  const expiryIso = new Date(Date.parse(nowIso) - CRON_LOCK_TTL_MS).toISOString();
  try {
    const result = await db
      .prepare(
        `INSERT INTO ingestion_state (key, value, updated_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at
         WHERE datetime(ingestion_state.updated_at) <= datetime(?4)`
      )
      .bind(CRON_LOCK_KEY, lockValue, nowIso, expiryIso)
      .run();

    return { acquired: (result.meta?.changes ?? 0) > 0 };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'cron lock unavailable';
    return { acquired: true, error: message };
  }
}

async function readSourceCursor(db: D1Database, source: SourceEvent['source']): Promise<string | null> {
  const row = await getIngestionState(db, cursorStateKey(source));
  if (!row?.value) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.value) as { publishedAt?: string };
    const publishedAt = parsed.publishedAt?.trim();
    return publishedAt || null;
  } catch {
    return null;
  }
}

async function writeSourceCursor(
  db: D1Database,
  source: SourceEvent['source'],
  publishedAt: string,
  nowIso: string,
  runId: string
): Promise<void> {
  const value = JSON.stringify({ publishedAt, runId });
  await putIngestionState(db, cursorStateKey(source), value, nowIso);
}

async function writeRunState(
  db: D1Database,
  mode: IngestionMode,
  payload: Record<string, unknown>,
  nowIso: string,
  errors?: string[]
): Promise<void> {
  try {
    await putIngestionState(db, runStateKey(mode), JSON.stringify(payload), nowIso);
  } catch (error) {
    if (!errors) {
      return;
    }
    const message = error instanceof Error ? error.message : 'run state write failed';
    errors.push(`run state write failed: ${message}`);
  }
}

function prepareSourceQueue(
  source: SourceEvent['source'],
  events: SourceEvent[],
  cursorPublishedAt: string | null,
  maxItems: number
): { queue: SourceEvent[]; eligibleCount: number; queuedOverflow: number } {
  const cursorMs = parseDateSafe(cursorPublishedAt);
  const dated: Array<{ event: SourceEvent; publishedMs: number }> = [];
  const undated: SourceEvent[] = [];

  for (const event of events) {
    const publishedMs = parseDateSafe(event.publishedAt);
    if (publishedMs === null) {
      undated.push(event);
      continue;
    }
    if (cursorMs !== null && publishedMs <= cursorMs) {
      continue;
    }
    dated.push({ event, publishedMs });
  }

  // Cursor progression is chronological to avoid starvation during source spikes.
  dated.sort((a, b) => a.publishedMs - b.publishedMs);
  const ordered = [...dated.map((entry) => entry.event), ...undated];
  const sourceCap = Math.max(0, maxItems);
  const queue = ordered.slice(0, sourceCap);
  const queuedOverflow = Math.max(0, ordered.length - queue.length);
  return { queue, eligibleCount: ordered.length, queuedOverflow };
}

function extractCveId(text: string): string | null {
  const match = text.match(/\bCVE-\d{4}-\d{4,}\b/i);
  if (!match?.[0]) {
    return null;
  }
  return match[0].toUpperCase();
}

function normalizedTokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
  return new Set(tokens);
}

function lexicalOverlapScore(a: string, b: string): number {
  const aSet = normalizedTokenSet(a);
  const bSet = normalizedTokenSet(b);
  if (aSet.size === 0 || bSet.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const token of aSet) {
    if (bSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(aSet.size, bSet.size);
}

function isStrictDuplicateHeuristic(a: StoredEvent, b: SourceEvent): boolean {
  if (a.url === b.url) {
    return true;
  }

  const cveA = extractCveId(`${a.externalId} ${a.title} ${a.summary}`);
  const cveB = extractCveId(`${b.externalId} ${b.title} ${b.summary}`);
  if (cveA && cveB && cveA === cveB) {
    return true;
  }

  if (a.externalId && b.externalId && a.externalId.toLowerCase() === b.externalId.toLowerCase()) {
    return true;
  }
  return false;
}

function isSemanticCandidate(a: StoredEvent, b: SourceEvent): boolean {
  const titleOverlap = lexicalOverlapScore(a.title, b.title);
  const bodyOverlap = lexicalOverlapScore(`${a.summary}`, `${b.summary}`);
  return titleOverlap >= 0.82 || (titleOverlap >= 0.6 && bodyOverlap >= 0.55);
}

async function recentStoredEvents(db: D1Database, limit = 120): Promise<StoredEvent[]> {
  const rows = await db
    .prepare(
      `SELECT id, source, external_id, title, url, summary, published_at
       FROM ingested_events
       ORDER BY datetime(COALESCE(published_at, created_at)) DESC
       LIMIT ?1`
    )
    .bind(limit)
    .all<StoredEventRow>();

  return (rows.results ?? []).map((row) => ({
    source: (row.source as SourceEvent['source']) ?? 'rss',
    externalId: row.external_id,
    title: row.title,
    url: row.url,
    summary: row.summary ?? '',
    publishedAt: row.published_at ?? null,
    severity: inferSeverity(row.title, row.summary ?? ''),
    confidence: 0.8,
    fingerprint: '',
  }));
}

export function isEventRecent(publishedAt: string | null, maxAgeDays: number, nowMs: number): boolean {
  const publishedMs = parseDateSafe(publishedAt);
  if (!publishedMs) {
    return false;
  }
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
  return nowMs - publishedMs <= maxAgeMs;
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

function normalizeSourceSeverity(value: string | undefined): 'low' | 'medium' | 'high' | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'critical' || normalized === 'high') {
    return 'high';
  }
  if (normalized === 'medium' || normalized === 'moderate') {
    return 'medium';
  }
  if (normalized === 'low') {
    return 'low';
  }
  return null;
}

function resolveSeverity(title: string, summary: string, sourceSeverity: 'low' | 'medium' | 'high' | undefined): 'low' | 'medium' | 'high' {
  const inferred = inferSeverity(title, summary);
  if (!sourceSeverity) {
    return inferred;
  }
  return severityRank(sourceSeverity) > severityRank(inferred) ? sourceSeverity : inferred;
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

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function toStoredEvent(input: SourceEvent): Promise<StoredEvent | null> {
  const relevance = scoreIncidentRelevance(input.title, input.summary, input.source);
  if (relevance < 0.4) {
    return null;
  }

  const basis = normalizeWhitespace(`${input.source}|${input.url.toLowerCase()}|${input.title.toLowerCase()}`);
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

async function fetchHnEvents(fetchFn: FetchLike, maxItems: number): Promise<SourceEvent[]> {
  if (maxItems <= 0) {
    return [];
  }
  const topRes = await fetchFn('https://hacker-news.firebaseio.com/v0/topstories.json');
  if (!topRes.ok) {
    throw new Error(`HN topstories failed: ${topRes.status}`);
  }

  const ids = (await topRes.json()) as number[];
  const selectedIds = ids.slice(0, maxItems);
  const events: SourceEvent[] = [];

  const itemPromises = selectedIds.map(async (id) => {
    const res = await fetchFn(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
    if (!res.ok) {
      return null;
    }

    const item = (await res.json()) as {
      id?: number;
      type?: string;
      title?: string;
      url?: string;
      text?: string;
      time?: number;
    };

    if (!item.id || item.type !== 'story' || !item.title || !item.url) {
      return null;
    }

    const summary = normalizeWhitespace(stripTags(item.text ?? ''));
    return {
      source: 'hn' as const,
      externalId: String(item.id),
      title: item.title,
      url: item.url,
      summary,
      publishedAt: toIsoFromUnixSeconds(item.time),
    };
  });

  const resolved = await Promise.all(itemPromises);
  for (const event of resolved) {
    if (event) {
      events.push(event);
    }
  }
  return events;
}

function firstEnglishDescription(descriptions: Array<{ lang?: string; value?: string }> | undefined): string {
  if (!descriptions || descriptions.length === 0) {
    return '';
  }
  const english = descriptions.find((item) => item.lang === 'en');
  return normalizeWhitespace(english?.value ?? descriptions[0]?.value ?? '');
}

async function fetchNvdEvents(
  fetchFn: FetchLike,
  apiKey: string | undefined,
  resultsPerKeyword: number
): Promise<SourceFetchResult> {
  const keywords = ['artificial intelligence', 'llm', 'prompt injection', 'machine learning'];
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = now.toISOString();

  const responses = await Promise.all(
    keywords.map(async (keyword): Promise<SourceFetchResult> => {
      const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=${resultsPerKeyword}&pubStartDate=${encodeURIComponent(startIso)}&pubEndDate=${encodeURIComponent(endIso)}`;
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers.apiKey = apiKey;
      }

      try {
        const res = await fetchFn(url, { headers });
        if (!res.ok) {
          return {
            events: [],
            errors: [`NVD keyword "${keyword}" failed: ${res.status}`],
          };
        }

        const body = (await res.json()) as {
          vulnerabilities?: Array<{
            cve?: {
              id?: string;
              published?: string;
              descriptions?: Array<{ lang?: string; value?: string }>;
            };
          }>;
        };

        const events = (body.vulnerabilities ?? [])
          .map((vulnerability) => {
            const cve = vulnerability.cve;
            const cveId = cve?.id;
            if (!cveId) {
              return null;
            }

            const summary = firstEnglishDescription(cve.descriptions);
            return {
              source: 'nvd' as const,
              externalId: cveId,
              title: `${cveId} (NVD)`,
              url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
              summary,
              publishedAt: cve.published ?? null,
            };
          })
          .filter(isPresent);

        return { events, errors: [] };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'NVD fetch failed';
        return {
          events: [],
          errors: [`NVD keyword "${keyword}" failed: ${message}`],
        };
      }
    })
  );

  return responses.reduce<SourceFetchResult>(
    (acc, item) => {
      acc.events.push(...item.events);
      acc.errors.push(...item.errors);
      return acc;
    },
    { events: [], errors: [] }
  );
}

async function fetchGitHubAdvisoryEvents(fetchFn: FetchLike, token: string | undefined, maxItems: number): Promise<SourceEvent[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-security-radar',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const perPage = Math.min(Math.max(maxItems, 5), 100);
  const res = await fetchFn(`https://api.github.com/advisories?per_page=${perPage}&sort=published&direction=desc`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub advisories failed: ${res.status}`);
  }

  const body = (await res.json()) as Array<{
    ghsa_id?: string;
    summary?: string;
    description?: string;
    html_url?: string;
    published_at?: string;
    aliases?: string[];
    severity?: string;
  }>;

  return (body ?? [])
    .slice(0, maxItems)
    .map((item) => {
      const externalId = item.ghsa_id ?? item.aliases?.[0] ?? '';
      const titleBase = compactSummaryText(item.summary ?? '', GHSA_TITLE_MAX_CHARS);
      const summary = summarizeGitHubAdvisory(item.summary ?? '', item.description, GHSA_SUMMARY_MAX_CHARS);
      const sourceSeverity = normalizeSourceSeverity(item.severity);
      if (!externalId || !titleBase || !item.html_url) {
        return null;
      }
      return {
        source: 'ghsa' as const,
        externalId,
        title: `${titleBase} (${externalId})`,
        url: item.html_url,
        summary,
        publishedAt: item.published_at ?? null,
        sourceSeverity: sourceSeverity ?? undefined,
      };
    })
    .filter(isPresent);
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

async function fetchCisaKevEvents(fetchFn: FetchLike, maxItems: number): Promise<SourceEvent[]> {
  const res = await fetchFn('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json');
  if (!res.ok) {
    throw new Error(`CISA KEV failed: ${res.status}`);
  }

  const body = (await res.json()) as {
    vulnerabilities?: Array<{
      cveID?: string;
      vendorProject?: string;
      product?: string;
      shortDescription?: string;
      dateAdded?: string;
      dueDate?: string;
    }>;
  };

  return (body.vulnerabilities ?? [])
    .slice(0, maxItems)
    .map((item) => {
      const cveId = item.cveID;
      if (!cveId) {
        return null;
      }
      const vendor = normalizeWhitespace(item.vendorProject ?? '');
      const product = normalizeWhitespace(item.product ?? '');
      const description = normalizeWhitespace(item.shortDescription ?? '');
      return {
        source: 'cisa_kev' as const,
        externalId: cveId,
        title: `${cveId} (CISA KEV)`,
        url: `https://www.cve.org/CVERecord?id=${encodeURIComponent(cveId)}`,
        summary: normalizeWhitespace(
          `${vendor}${vendor && product ? ' ' : ''}${product}${description ? ` - ${description}` : ''}`
        ),
        publishedAt: item.dateAdded ?? item.dueDate ?? null,
      };
    })
    .filter(isPresent);
}

async function fetchEuvdEvents(fetchFn: FetchLike, maxItems: number): Promise<SourceEvent[]> {
  const res = await fetchFn('https://euvdservices.enisa.europa.eu/api/lastvulnerabilities');
  if (!res.ok) {
    throw new Error(`EUVD failed: ${res.status}`);
  }

  const body = (await res.json()) as
    | Array<Record<string, unknown>>
    | { items?: Array<Record<string, unknown>>; vulnerabilities?: Array<Record<string, unknown>> };
  const rows = Array.isArray(body) ? body : (body.items ?? body.vulnerabilities ?? []);

  return rows
    .slice(0, maxItems)
    .map((row) => {
      const cve = String(row.cve ?? row.cveId ?? row.id ?? '').trim();
      const title = String(row.title ?? row.summary ?? cve).trim();
      const summary = normalizeWhitespace(String(row.description ?? row.summary ?? title));
      const publishedAt = String(row.published ?? row.publishedAt ?? row.date ?? '').trim() || null;
      if (!cve || !title) {
        return null;
      }
      return {
        source: 'euvd' as const,
        externalId: cve,
        title: `${title} (EUVD)`,
        url: `https://euvd.enisa.europa.eu/vulnerability/${encodeURIComponent(cve)}`,
        summary,
        publishedAt,
      };
    })
    .filter(isPresent);
}

function resolveRssFeedUrls(env: EnvBindings): string[] {
  if (!env.RSS_FEEDS) {
    return DEFAULT_RSS_FEEDS;
  }
  return env.RSS_FEEDS.split(',').map((item) => item.trim()).filter(Boolean);
}

async function fetchRssEvents(fetchFn: FetchLike, env: EnvBindings, maxItemsPerFeed: number): Promise<SourceFetchResult> {
  const urls = resolveRssFeedUrls(env);
  const feedPromises = urls.map(async (feedUrl): Promise<SourceFetchResult> => {
    try {
      const res = await fetchFn(feedUrl, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
      if (!res.ok) {
        return {
          events: [],
          errors: [`RSS feed "${feedUrl}" failed: ${res.status}`],
        };
      }
      const xml = await res.text();
      return {
        events: parseRssOrAtom(xml, feedUrl).slice(0, maxItemsPerFeed),
        errors: [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'RSS fetch failed';
      return {
        events: [],
        errors: [`RSS feed "${feedUrl}" failed: ${message}`],
      };
    }
  });

  const resolved = await Promise.all(feedPromises);
  return resolved.reduce<SourceFetchResult>(
    (acc, item) => {
      acc.events.push(...item.events);
      acc.errors.push(...item.errors);
      return acc;
    },
    { events: [], errors: [] }
  );
}

function buildDraftPost(event: StoredEvent, nowIso: string, autoPublish: boolean): DraftPost {
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

async function storeEvent(db: D1Database, event: StoredEvent, nowIso: string): Promise<{ eventId: number; inserted: boolean }> {
  const insert = await db
    .prepare(
      `INSERT INTO ingested_events
       (source, external_id, title, url, summary, published_at, severity, confidence, fingerprint, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
       ON CONFLICT(fingerprint) DO NOTHING`
    )
    .bind(
      event.source,
      event.externalId,
      event.title,
      event.url,
      event.summary,
      event.publishedAt,
      event.severity,
      event.confidence,
      event.fingerprint,
      nowIso
    )
    .run();

  const row = await db
    .prepare('SELECT id FROM ingested_events WHERE fingerprint = ?1 LIMIT 1')
    .bind(event.fingerprint)
    .first<{ id: number }>();

  if (!row?.id) {
    throw new Error('Event insert/select failed');
  }

  const inserted = Boolean((insert.meta?.changes ?? 0) > 0);
  return { eventId: row.id, inserted };
}

async function storeDraft(
  db: D1Database,
  eventId: number,
  draft: DraftPost,
  nowIso: string
): Promise<{ inserted: boolean; draftId: number | null }> {
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
    .prepare('SELECT id FROM draft_posts WHERE event_id = ?1 LIMIT 1')
    .bind(eventId)
    .first<{ id: number }>();

  return {
    inserted: Boolean((insertedResult.meta?.changes ?? 0) > 0),
    draftId: row?.id ?? null,
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

export async function runIngestionPipeline(
  env: EnvBindings,
  fetchFn: FetchLike = fetch,
  options: IngestionRunOptions = {}
): Promise<IngestionRunResult> {
  const mode: IngestionMode = options.mode ?? 'manual';
  const runId = options.runId ?? buildRunId(mode);
  const sourceStats = initSourceStats();
  const baseResult: IngestionRunResult = {
    mode,
    lockSkipped: false,
    stopReason: 'completed',
    fetched: 0,
    relevant: 0,
    processed: 0,
    inserted: 0,
    deduped: 0,
    queuedForNextRun: 0,
    draftsCreated: 0,
    llmDedupeCalls: 0,
    llmEnrichCalls: 0,
    sourceStats,
    errors: [],
  };

  if (!env.DB) {
    return {
      ...baseResult,
      errors: ['DB not configured'],
    };
  }

  const startedAt = Date.now();
  const nowIso = new Date(startedAt).toISOString();
  const maxAgeDays = Math.min(Math.max(Number(env.MAX_EVENT_AGE_DAYS ?? '60'), 1), 365);
  const caps = resolveRuntimeCaps(env, mode);
  const errors: string[] = [];
  const enableHn = (env.ENABLE_HN_SOURCE ?? 'true').toLowerCase() === 'true';
  const shouldUseLlmDedupe = (env.LLM_DEDUPE_ENABLED ?? 'true').toLowerCase() === 'true' && caps.llmDedupeMaxCalls > 0;
  const llmDedupeMaxCalls = shouldUseLlmDedupe ? caps.llmDedupeMaxCalls : 0;
  let llmDedupeCalls = 0;
  const llmEnrichCalls = 0;
  const timedFetch = withFetchTimeout(fetchFn, caps.fetchTimeoutMs);
  const rssFeedCount = resolveRssFeedUrls(env).length;

  await writeRunState(
    env.DB,
    mode,
    {
      runId,
      mode,
      phase: 'started',
      startedAt: nowIso,
      finishedAt: null,
      lockSkipped: false,
    },
    nowIso,
    errors
  );

  if (mode === 'cron') {
    const lockPayload = JSON.stringify({ runId, acquiredAt: nowIso });
    const lock = await acquireCronLock(env.DB, nowIso, lockPayload);
    if (lock.error) {
      errors.push(`cron lock warning: ${lock.error}`);
    }
    if (!lock.acquired) {
      const finishedAt = new Date().toISOString();
      const lockSkippedResult = {
        ...baseResult,
        lockSkipped: true,
        errors,
      };
      await writeRunState(
        env.DB,
        mode,
        {
          runId,
          phase: 'lock_skipped',
          startedAt: nowIso,
          finishedAt,
          ...lockSkippedResult,
        },
        finishedAt,
        errors
      );
      console.log(JSON.stringify({ event: 'ingestion_summary', runId, ...lockSkippedResult, errors_count: errors.length }));
      return lockSkippedResult;
    }
  }

  try {
    const knownEvents = await recentStoredEvents(env.DB, 120);
    const seenFingerprints = new Set<string>();
    let fetched = 0;
    let relevant = 0;
    let processed = 0;
    let inserted = 0;
    let deduped = 0;
    let queuedForNextRun = 0;
    let draftsCreated = 0;
    let dbWrites = 0;
    let stopReason: IngestionStopReason = 'completed';

    for (const source of SOURCE_ORDER) {
      if (source === 'hn' && !enableHn) {
        continue;
      }

      if (Date.now() - startedAt > caps.maxRuntimeMs) {
        stopReason = 'runtime_budget';
        break;
      }

      const stats = sourceStats[source];
      let sourceEvents: SourceEvent[] = [];
      try {
        if (source === 'nvd') {
          const result = await fetchNvdEvents(timedFetch, env.NVD_API_KEY, caps.nvdResultsPerKeyword);
          sourceEvents = result.events;
          if (result.errors.length > 0) {
            errors.push(...result.errors);
            stats.errors += result.errors.length;
          }
        } else if (source === 'cisa_kev') {
          sourceEvents = await fetchCisaKevEvents(timedFetch, caps.cisaMaxItemsPerRun);
        } else if (source === 'euvd') {
          sourceEvents = await fetchEuvdEvents(timedFetch, caps.euvdMaxItemsPerRun);
        } else if (source === 'ghsa') {
          sourceEvents = await fetchGitHubAdvisoryEvents(timedFetch, env.GITHUB_API_TOKEN, caps.ghsaMaxItemsPerRun);
        } else if (source === 'rss') {
          const result = await fetchRssEvents(timedFetch, env, caps.rssMaxItemsPerFeed);
          sourceEvents = result.events;
          if (result.errors.length > 0) {
            errors.push(...result.errors);
            stats.errors += result.errors.length;
          }
        } else if (source === 'hn') {
          sourceEvents = await fetchHnEvents(timedFetch, caps.hnMaxItems);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : `source fetch failed (${source})`;
        errors.push(message);
        stats.errors += 1;
        continue;
      }

      fetched += sourceEvents.length;
      stats.fetched += sourceEvents.length;

      let cursorPublishedAt: string | null = null;
      try {
        cursorPublishedAt = await readSourceCursor(env.DB, source);
      } catch (error) {
        const message = error instanceof Error ? error.message : `cursor read failed (${source})`;
        errors.push(message);
        stats.errors += 1;
      }

      const sourceCap = sourceMaxItems(source, caps, rssFeedCount);
      const prepared = prepareSourceQueue(source, sourceEvents, cursorPublishedAt, sourceCap);
      stats.eligible += prepared.eligibleCount;
      stats.queued += prepared.queuedOverflow;
      queuedForNextRun += prepared.queuedOverflow;

      let latestProcessedPublishedAt: string | null = null;

      for (let index = 0; index < prepared.queue.length; index += 1) {
        if (Date.now() - startedAt > caps.maxRuntimeMs) {
          stopReason = 'runtime_budget';
          const remaining = prepared.queue.length - index;
          stats.queued += remaining;
          queuedForNextRun += remaining;
          break;
        }
        if (processed >= caps.maxProcessEvents) {
          stopReason = 'event_budget';
          const remaining = prepared.queue.length - index;
          stats.queued += remaining;
          queuedForNextRun += remaining;
          break;
        }
        if (dbWrites >= caps.maxDbWrites) {
          stopReason = 'db_budget';
          const remaining = prepared.queue.length - index;
          stats.queued += remaining;
          queuedForNextRun += remaining;
          break;
        }

        const raw = prepared.queue[index];
        try {
          const stored = await toStoredEvent(raw);
          if (!stored) {
            continue;
          }
          const publishedMs = parseDateSafe(stored.publishedAt);
          const hasValidPublishedAt = publishedMs !== null;
          if (hasValidPublishedAt && !isEventRecent(stored.publishedAt, maxAgeDays, startedAt)) {
            continue;
          }

          if (hasValidPublishedAt && publishedMs !== null) {
            latestProcessedPublishedAt = new Date(publishedMs).toISOString();
          }

          relevant += 1;
          processed += 1;
          stats.processed += 1;

          if (seenFingerprints.has(stored.fingerprint)) {
            deduped += 1;
            stats.deduped += 1;
            continue;
          }
          seenFingerprints.add(stored.fingerprint);

          const heuristicCandidates = knownEvents
            .filter((item) => isSemanticCandidate(item, stored))
            .slice(0, 4);

          let duplicateBySignal = false;
          for (const candidate of knownEvents) {
            if (isStrictDuplicateHeuristic(candidate, stored)) {
              duplicateBySignal = true;
              break;
            }
          }

          let duplicateByLlm = false;
          if (!duplicateBySignal && shouldUseLlmDedupe) {
            for (const candidate of heuristicCandidates) {
              if (llmDedupeCalls >= llmDedupeMaxCalls) {
                break;
              }
              llmDedupeCalls += 1;
              try {
                const decision = await llmDuplicateDecision(env, stored, candidate);
                if (decision?.duplicate && decision.confidence >= 0.75) {
                  duplicateByLlm = true;
                  break;
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : 'llm dedupe error';
                errors.push(message);
                stats.errors += 1;
              }
            }
          }

          if (duplicateBySignal || duplicateByLlm) {
            deduped += 1;
            stats.deduped += 1;
            continue;
          }

          const persisted = await storeEvent(env.DB, stored, nowIso);
          dbWrites += 1;
          if (persisted.inserted) {
            inserted += 1;
            stats.inserted += 1;
            knownEvents.unshift(stored);
            if (knownEvents.length > 150) {
              knownEvents.pop();
            }
          } else {
            deduped += 1;
            stats.deduped += 1;
          }

          // Hybrid workflow:
          // - High severity incidents from trusted sources auto-publish.
          // - Other incidents remain ingestion-only until manually drafted in admin.
          if (shouldAutoPublish(stored, env)) {
            if (dbWrites >= caps.maxDbWrites) {
              stopReason = 'db_budget';
              const remaining = prepared.queue.length - index - 1;
              if (remaining > 0) {
                stats.queued += remaining;
                queuedForNextRun += remaining;
              }
              break;
            }
            const draft = buildDraftPost(stored, nowIso, true);
            const savedDraft = await storeDraft(env.DB, persisted.eventId, draft, nowIso);
            dbWrites += 1;
            if (savedDraft.inserted) {
              draftsCreated += 1;
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'pipeline processing error';
          errors.push(message);
          stats.errors += 1;
        }
      }

      if (latestProcessedPublishedAt) {
        try {
          await writeSourceCursor(env.DB, source, latestProcessedPublishedAt, nowIso, runId);
        } catch (error) {
          const message = error instanceof Error ? error.message : `cursor write failed (${source})`;
          errors.push(message);
          stats.errors += 1;
        }
      }

      if (stopReason !== 'completed') {
        break;
      }
    }

    const result: IngestionRunResult = {
      mode,
      lockSkipped: false,
      stopReason,
      fetched,
      relevant,
      processed,
      inserted,
      deduped,
      queuedForNextRun,
      draftsCreated,
      llmDedupeCalls,
      llmEnrichCalls,
      sourceStats,
      errors,
    };

    const finishedAt = new Date().toISOString();
    await writeRunState(
      env.DB,
      mode,
      {
        runId,
        phase: 'completed',
        startedAt: nowIso,
        finishedAt,
        ...result,
      },
      finishedAt,
      errors
    );

    console.log(
      JSON.stringify({
        event: 'ingestion_summary',
        runId,
        mode,
        lockSkipped: false,
        stopReason,
        fetched,
        relevant,
        processed,
        inserted,
        deduped,
        queuedForNextRun,
        draftsCreated,
        llmDedupeCalls,
        errors_count: errors.length,
        sourceStats,
      })
    );

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'pipeline processing error';
    errors.push(message);
    const finishedAt = new Date().toISOString();
    await writeRunState(
      env.DB,
      mode,
      {
        runId,
        mode,
        phase: 'failed',
        startedAt: nowIso,
        finishedAt,
        errors,
        sourceStats,
      },
      finishedAt,
      errors
    );
    throw error;
  } finally {
    if (mode === 'cron') {
      try {
        await deleteIngestionState(env.DB, CRON_LOCK_KEY);
      } catch {
        // Lock release failure should not fail the run response.
      }
    }
  }
}
