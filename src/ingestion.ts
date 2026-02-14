import type { EnvBindings } from './app';
import { llmDuplicateDecision } from './llm';

export type SourceEvent = {
  source: 'hn' | 'nvd' | 'rss' | 'ghsa' | 'cisa_kev' | 'euvd';
  externalId: string;
  title: string;
  url: string;
  summary: string;
  publishedAt: string | null;
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

export type IngestionRunResult = {
  fetched: number;
  processed: number;
  relevant: number;
  inserted: number;
  deduped: number;
  draftsCreated: number;
  llmDedupeCalls: number;
  llmEnrichCalls: number;
  errors: string[];
};

export type RuntimeCaps = {
  hnMaxItems: number;
  llmDedupeMaxCalls: number;
  llmEnrichMaxCalls: number;
  ingestionMaxEventsPerRun: number;
};

type SourceKey = SourceEvent['source'];

export type IngestionRunOptions = {
  sourceAllowlist?: ReadonlySet<SourceKey>;
  maxEventsToProcess?: number;
};

type FetchLike = typeof fetch;

const AI_TERMS = [
  'ai',
  'artificial intelligence',
  'llm',
  'model',
  'agent',
  'chatgpt',
  'gemini',
  'copilot',
  'claude',
  'anthropic',
  'openai',
  'prompt',
];

const SECURITY_TERMS = [
  'security',
  'vulnerability',
  'cve',
  'breach',
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

export function resolveRuntimeCaps(env: EnvBindings): RuntimeCaps {
  return {
    hnMaxItems: clampInt(env.HN_MAX_ITEMS, 8, 0, 20),
    llmDedupeMaxCalls: clampInt(env.LLM_DEDUPE_MAX_CALLS, 6, 0, 12),
    llmEnrichMaxCalls: clampInt(env.LLM_ENRICH_MAX_CALLS, 2, 0, 3),
    ingestionMaxEventsPerRun: clampInt(env.INGESTION_MAX_EVENTS_PER_RUN, 36, 5, 120),
  };
}

const SCHEDULED_SOURCE_BATCHES: SourceKey[][] = [
  ['nvd', 'ghsa', 'cisa_kev'],
  ['rss', 'euvd', 'hn'],
];

const SCHEDULED_SLOT_MS = 30 * 60 * 1000;

export function resolveScheduledSources(scheduledTimeMs: number, splitEnabled: boolean, enableHn: boolean): ReadonlySet<SourceKey> {
  if (!splitEnabled) {
    return new Set(enableHn ? ['hn', 'nvd', 'rss', 'ghsa', 'cisa_kev', 'euvd'] : ['nvd', 'rss', 'ghsa', 'cisa_kev', 'euvd']);
  }
  const slot = Math.floor(scheduledTimeMs / SCHEDULED_SLOT_MS);
  const batch = SCHEDULED_SOURCE_BATCHES[slot % SCHEDULED_SOURCE_BATCHES.length] ?? [];
  const filtered = batch.filter((source) => source !== 'hn' || enableHn);
  return new Set(filtered);
}

export function resolveScheduledSourcesFromCron(cron: string | undefined, enableHn: boolean): ReadonlySet<SourceKey> | null {
  const normalized = cron?.trim() ?? '';
  if (!normalized) {
    return null;
  }
  if (normalized === '0 * * * *') {
    return new Set(['nvd']);
  }
  if (normalized === '10 * * * *') {
    return new Set(['ghsa']);
  }
  if (normalized === '20 * * * *') {
    return new Set(['cisa_kev']);
  }
  if (normalized === '30 * * * *') {
    return new Set(['rss']);
  }
  if (normalized === '40 * * * *') {
    return new Set(['euvd']);
  }
  if (normalized === '50 * * * *') {
    return enableHn ? new Set(['hn']) : new Set();
  }
  return null;
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

function hasAnyTerm(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isLikelyAiSecurityIncident(title: string, summary: string, source: SourceEvent['source']): boolean {
  const haystack = `${title} ${summary}`.toLowerCase();
  const hasAiSignal = hasAnyTerm(haystack, AI_TERMS);
  const hasSecuritySignal = hasAnyTerm(haystack, SECURITY_TERMS);

  if (source === 'hn') {
    const hasIncidentSignal = hasAnyTerm(haystack, HN_INCIDENT_TERMS);
    const hasNoiseSignal = hasAnyTerm(haystack, HN_NOISE_TERMS);
    return hasAiSignal && hasIncidentSignal && !hasNoiseSignal;
  }

  if (source === 'rss') {
    return hasAiSignal && hasSecuritySignal;
  }

  // NVD connector is already keyword-filtered to AI-related searches.
  if (source === 'nvd') {
    return true;
  }

  // GHSA, CISA KEV, and EUVD entries are security-focused; require AI context.
  return hasAiSignal;
}

export function scoreIncidentRelevance(title: string, summary: string, source: SourceEvent['source']): number {
  if (!isLikelyAiSecurityIncident(title, summary, source)) {
    return 0;
  }
  const haystack = `${title} ${summary}`.toLowerCase();
  const aiHits = AI_TERMS.filter((term) => haystack.includes(term)).length;
  const securityHits = SECURITY_TERMS.filter((term) => haystack.includes(term)).length;
  const weighted = Math.min(1, (aiHits * 0.45 + securityHits * 0.55) / 4);
  return Math.max(0.4, weighted);
}

function parseDateSafe(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
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
  for (const term of HIGH_SEVERITY_TERMS) {
    if (haystack.includes(term)) {
      return 'high';
    }
  }
  if (haystack.includes('cve') || haystack.includes('vulnerability') || haystack.includes('exploit')) {
    return 'medium';
  }
  return 'low';
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

function trustedSources(env: EnvBindings): Set<string> {
  const raw = env.AUTO_PUBLISH_TRUSTED_SOURCES ?? 'nvd';
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
  return {
    ...input,
    severity: inferSeverity(input.title, input.summary),
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

async function fetchNvdEvents(fetchFn: FetchLike, apiKey?: string): Promise<SourceEvent[]> {
  const keywords = ['artificial intelligence', 'llm', 'prompt injection', 'machine learning'];
  const events: SourceEvent[] = [];
  const now = new Date();
  const start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const startIso = start.toISOString();
  const endIso = now.toISOString();

  for (const keyword of keywords) {
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(keyword)}&resultsPerPage=10&pubStartDate=${encodeURIComponent(startIso)}&pubEndDate=${encodeURIComponent(endIso)}`;
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers.apiKey = apiKey;
    }

    const res = await fetchFn(url, { headers });
    if (!res.ok) {
      continue;
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

    for (const vulnerability of body.vulnerabilities ?? []) {
      const cve = vulnerability.cve;
      const cveId = cve?.id;
      if (!cveId) {
        continue;
      }

      const summary = firstEnglishDescription(cve.descriptions);
      events.push({
        source: 'nvd',
        externalId: cveId,
        title: `${cveId} (NVD)`,
        url: `https://nvd.nist.gov/vuln/detail/${cveId}`,
        summary,
        publishedAt: cve.published ?? null,
      });
    }
  }

  return events;
}

async function fetchGitHubAdvisoryEvents(fetchFn: FetchLike, token?: string): Promise<SourceEvent[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'ai-security-radar',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetchFn('https://api.github.com/advisories?per_page=40&sort=published&direction=desc', { headers });
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
  }>;

  return (body ?? [])
    .map((item) => {
      const externalId = item.ghsa_id ?? item.aliases?.[0] ?? '';
      const summary = normalizeWhitespace(item.description ?? item.summary ?? '');
      if (!externalId || !item.summary || !item.html_url) {
        return null;
      }
      return {
        source: 'ghsa' as const,
        externalId,
        title: `${item.summary} (${externalId})`,
        url: item.html_url,
        summary,
        publishedAt: item.published_at ?? null,
      };
    })
    .filter(isPresent);
}

async function fetchCisaKevEvents(fetchFn: FetchLike): Promise<SourceEvent[]> {
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

async function fetchEuvdEvents(fetchFn: FetchLike): Promise<SourceEvent[]> {
  const res = await fetchFn('https://euvdservices.enisa.europa.eu/api/lastvulnerabilities');
  if (!res.ok) {
    throw new Error(`EUVD failed: ${res.status}`);
  }

  const body = (await res.json()) as
    | Array<Record<string, unknown>>
    | { items?: Array<Record<string, unknown>>; vulnerabilities?: Array<Record<string, unknown>> };
  const rows = Array.isArray(body) ? body : (body.items ?? body.vulnerabilities ?? []);

  return rows
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

async function fetchRssEvents(fetchFn: FetchLike, env: EnvBindings): Promise<SourceEvent[]> {
  const urls = resolveRssFeedUrls(env);
  const events: SourceEvent[] = [];

  const feedPromises = urls.map(async (feedUrl) => {
    const res = await fetchFn(feedUrl, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
    if (!res.ok) {
      return [];
    }
    const xml = await res.text();
    return parseRssOrAtom(xml, feedUrl);
  });

  const resolved = await Promise.all(feedPromises);
  for (const chunk of resolved) {
    events.push(...chunk);
  }
  return events;
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

function prioritizeEventsForProcessing(events: SourceEvent[], maxToProcess: number): SourceEvent[] {
  if (maxToProcess <= 0) {
    return [];
  }
  return [...events]
    .sort((a, b) => {
      const aMs = parseDateSafe(a.publishedAt);
      const bMs = parseDateSafe(b.publishedAt);
      if (aMs === null && bMs === null) {
        return 0;
      }
      if (aMs === null) {
        return 1;
      }
      if (bMs === null) {
        return -1;
      }
      return bMs - aMs;
    })
    .slice(0, maxToProcess);
}

export async function runIngestionPipeline(
  env: EnvBindings,
  fetchFn: FetchLike = fetch,
  options: IngestionRunOptions = {}
): Promise<IngestionRunResult> {
  if (!env.DB) {
    return {
      fetched: 0,
      processed: 0,
      relevant: 0,
      inserted: 0,
      deduped: 0,
      draftsCreated: 0,
      llmDedupeCalls: 0,
      llmEnrichCalls: 0,
      errors: ['DB not configured'],
    };
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const maxAgeDays = Math.min(Math.max(Number(env.MAX_EVENT_AGE_DAYS ?? '60'), 1), 365);
  const caps = resolveRuntimeCaps(env);
  const errors: string[] = [];
  const enableHn = (env.ENABLE_HN_SOURCE ?? 'true').toLowerCase() === 'true';
  const sourceAllowlist = options.sourceAllowlist;
  const llmDedupeMaxCalls = caps.llmDedupeMaxCalls;
  let llmDedupeCalls = 0;
  const llmEnrichCalls = 0;
  const knownEvents = await recentStoredEvents(env.DB, 120);

  const sourceTasks: Array<{ name: SourceKey; run: Promise<SourceEvent[]> }> = [];
  const includeSource = (source: SourceKey): boolean => !sourceAllowlist || sourceAllowlist.has(source);

  if (includeSource('hn') && enableHn) {
    sourceTasks.push({ name: 'hn', run: fetchHnEvents(fetchFn, caps.hnMaxItems) });
  }
  if (includeSource('nvd')) {
    sourceTasks.push({ name: 'nvd', run: fetchNvdEvents(fetchFn, env.NVD_API_KEY) });
  }
  if (includeSource('cisa_kev')) {
    sourceTasks.push({ name: 'cisa_kev', run: fetchCisaKevEvents(fetchFn) });
  }
  if (includeSource('euvd')) {
    sourceTasks.push({ name: 'euvd', run: fetchEuvdEvents(fetchFn) });
  }
  if (includeSource('ghsa')) {
    sourceTasks.push({ name: 'ghsa', run: fetchGitHubAdvisoryEvents(fetchFn, env.GITHUB_API_TOKEN) });
  }
  if (includeSource('rss')) {
    sourceTasks.push({ name: 'rss', run: fetchRssEvents(fetchFn, env) });
  }

  const sourceResults = await Promise.allSettled(sourceTasks.map((task) => task.run));

  const rawEvents: SourceEvent[] = [];
  for (let i = 0; i < sourceResults.length; i += 1) {
    const result = sourceResults[i];
    const sourceName = sourceTasks[i]?.name ?? 'unknown';
    if (result.status === 'fulfilled') {
      rawEvents.push(...result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : 'unknown source error';
      errors.push(`${sourceName}: ${message}`);
    }
  }

  const maxEventsToProcess = Math.max(
    1,
    Math.min(
      options.maxEventsToProcess ?? caps.ingestionMaxEventsPerRun,
      caps.ingestionMaxEventsPerRun
    )
  );
  const queuedEvents = prioritizeEventsForProcessing(rawEvents, maxEventsToProcess);
  if (rawEvents.length > queuedEvents.length) {
    errors.push(
      `Run cap hit: processed ${queuedEvents.length}/${rawEvents.length} events (set INGESTION_MAX_EVENTS_PER_RUN to tune)`
    );
  }

  const seenFingerprints = new Set<string>();
  let relevant = 0;
  let inserted = 0;
  let deduped = 0;
  let draftsCreated = 0;

  for (const raw of queuedEvents) {
    try {
      const stored = await toStoredEvent(raw);
      if (!stored) {
        continue;
      }
      if (!isEventRecent(stored.publishedAt, maxAgeDays, now)) {
        continue;
      }
      relevant += 1;

      if (seenFingerprints.has(stored.fingerprint)) {
        deduped += 1;
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
      if (!duplicateBySignal && (env.LLM_DEDUPE_ENABLED ?? 'true').toLowerCase() === 'true') {
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
          }
        }
      }

      if (duplicateBySignal || duplicateByLlm) {
        deduped += 1;
        continue;
      }

      const persisted = await storeEvent(env.DB, stored, nowIso);
      if (persisted.inserted) {
        inserted += 1;
        knownEvents.unshift(stored);
        if (knownEvents.length > 150) {
          knownEvents.pop();
        }
      } else {
        deduped += 1;
      }

      // Hybrid workflow:
      // - High severity incidents from trusted sources auto-publish.
      // - Other incidents remain ingestion-only until manually drafted in admin.
      if (shouldAutoPublish(stored, env)) {
        const draft = buildDraftPost(stored, nowIso, true);
        const savedDraft = await storeDraft(env.DB, persisted.eventId, draft, nowIso);
        if (savedDraft.inserted) {
          draftsCreated += 1;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'pipeline processing error';
      errors.push(message);
    }
  }

  return {
    fetched: rawEvents.length,
    processed: queuedEvents.length,
    relevant,
    inserted,
    deduped,
    draftsCreated,
    llmDedupeCalls,
    llmEnrichCalls,
    errors,
  };
}
