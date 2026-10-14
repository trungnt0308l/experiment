import type { EnvBindings } from './app';
import { parseRssOrAtom, resolveRuntimeCaps, type SourceEvent } from './ingestion';
import { isoDate, jsonArray, jsonObject, scoreSeverity, SourceHttpError, sourceRequest } from './ingestion-network';

export const SOURCES: SourceEvent['source'][] = ['nvd', 'cisa_kev', 'euvd', 'ghsa', 'rss', 'hn'];
export const NVD_QUERIES = ['artificial intelligence', 'llm', 'prompt injection', 'machine learning'];
export type ScanPosition = { start: string; end: string; offset: number; itemOffset?: number; next?: string; complete?: boolean; dateField?: 'published' | 'updated' };
export type SourcePage = { events: SourceEvent[]; next?: string; offset?: number; warnings: string[] };
type Context = { env: EnvBindings; fetchFn: typeof fetch; timeout: number; position: ScanPosition; query: string };

function text(value: unknown, max = 16384): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function validEvent(event: SourceEvent): SourceEvent {
  const url = new URL(event.url);
  if (!event.externalId || !event.title || !['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid source event');
  return { ...event, externalId: event.externalId.slice(0, 500), title: event.title.slice(0, 500), summary: event.summary.slice(0, 16384) };
}

function severity(value: unknown, score?: unknown): SourceEvent['sourceSeverity'] {
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'medium' || value === 'moderate') return 'medium';
  if (value === 'low') return 'low';
  return scoreSeverity(score);
}

function nvdSeverity(metrics: unknown): SourceEvent['sourceSeverity'] {
  if (!metrics || typeof metrics !== 'object') return undefined;
  const scores = Object.values(metrics).flatMap((list) => Array.isArray(list) ? list : [])
    .map((item) => item?.cvssData?.baseScore).filter((score): score is number => typeof score === 'number');
  return scores.length ? scoreSeverity(Math.max(...scores)) : undefined;
}

function nvdEvent(value: unknown): SourceEvent {
  const cve = jsonObject(jsonObject(value).cve);
  const descriptions = jsonArray(cve.descriptions);
  const english = descriptions.map(jsonObject).find((item) => item.lang === 'en');
  const id = text(cve.id, 100);
  return validEvent({ source: 'nvd', externalId: id, cveId: id, title: `${id} (NVD)`,
    url: `https://nvd.nist.gov/vuln/detail/${encodeURIComponent(id)}`, summary: text(english?.value),
    publishedAt: isoDate(cve.published), updatedAt: isoDate(cve.lastModified),
    sourceSeverity: nvdSeverity(cve.metrics), metadata: { metrics: cve.metrics, references: cve.references } });
}

async function nvdPage(ctx: Context): Promise<SourcePage> {
  const url = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
  const pageSize = Math.min(200, Math.max(2, Number(ctx.env.INGEST_NVD_RESULTS_PER_KEYWORD ?? 100)));
  url.search = new URLSearchParams({ keywordSearch: ctx.query, resultsPerPage: String(pageSize),
    startIndex: String(ctx.position.offset),
    [ctx.position.dateField === 'updated' ? 'lastModStartDate' : 'pubStartDate']: ctx.position.start,
    [ctx.position.dateField === 'updated' ? 'lastModEndDate' : 'pubEndDate']: ctx.position.end }).toString();
  const headers: Record<string, string> = ctx.env.NVD_API_KEY ? { apiKey: ctx.env.NVD_API_KEY } : {};
  const response = await sourceRequest(ctx.fetchFn, url.toString(), ctx.timeout, { headers });
  const body = jsonObject(JSON.parse(response.body));
  const rows = jsonArray(body.vulnerabilities);
  const total = Number(body.totalResults ?? rows.length);
  if (!Number.isFinite(total) || total < 0) throw new Error('Invalid NVD result count');
  const nextOffset = ctx.position.offset + rows.length;
  if (!rows.length && nextOffset < total) throw new Error('NVD returned an incomplete empty page');
  return { events: rows.map(nvdEvent), offset: nextOffset < total ? nextOffset : undefined, warnings: [] };
}

function nextLink(header: string | null): string | undefined {
  const match = header?.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return undefined;
  const url = new URL(match[1]);
  if (url.origin !== 'https://api.github.com' || url.pathname !== '/advisories') throw new Error('Invalid GitHub pagination link');
  return url.toString();
}

function ghsaEvent(value: unknown): SourceEvent {
  const item = jsonObject(value);
  const id = text(item.ghsa_id, 100);
  const title = text(item.summary, 300);
  return validEvent({ source: 'ghsa', externalId: id, cveId: text(item.cve_id, 100) || undefined,
    title: `${title} (${id})`, summary: `${title}\n${text(item.description)}`,
    url: text(item.html_url, 1000), publishedAt: isoDate(item.published_at), updatedAt: isoDate(item.updated_at),
    sourceSeverity: severity(item.severity), metadata: { vulnerabilities: item.vulnerabilities, references: item.references, cvss: item.cvss } });
}

async function ghsaPage(ctx: Context): Promise<SourcePage> {
  const url = new URL(ctx.position.next ?? 'https://api.github.com/advisories');
  if (!ctx.position.next) url.search = new URLSearchParams({ type: 'reviewed', is_withdrawn: 'false', per_page: String(Math.min(100, resolveRuntimeCaps(ctx.env, 'manual').ghsaMaxItemsPerRun)), sort: ctx.position.dateField === 'updated' ? 'updated' : 'published', direction: 'asc',
    [ctx.position.dateField === 'updated' ? 'modified' : 'published']: `${ctx.position.start.slice(0, 10)}..${ctx.position.end.slice(0, 10)}` }).toString();
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'ai-security-radar' };
  if (ctx.env.GITHUB_API_TOKEN) headers.Authorization = `Bearer ${ctx.env.GITHUB_API_TOKEN}`;
  const warnings: string[] = [];
  let response;
  try { response = await sourceRequest(ctx.fetchFn, url.toString(), ctx.timeout, { headers }); }
  catch (error) {
    if (!(error instanceof SourceHttpError) || error.status !== 401 || !headers.Authorization) throw error;
    delete headers.Authorization;
    ctx.env.GITHUB_API_TOKEN = undefined; // This run's copied bindings use public access for subsequent pages.
    warnings.push('GitHub token rejected (401); using public advisory access. Rotate the source token.');
    try { response = await sourceRequest(ctx.fetchFn, url.toString(), ctx.timeout, { headers }); }
    catch (fallbackError) {
      if (fallbackError instanceof SourceHttpError) fallbackError.warnings.push(...warnings);
      throw fallbackError;
    }
  }
  return { events: jsonArray(JSON.parse(response.body)).map(ghsaEvent), next: nextLink(response.headers.get('link')), warnings };
}

function euvdEvent(value: unknown): SourceEvent {
  const row = jsonObject(value);
  const id = text(row.id ?? row.cve ?? row.cveId, 100);
  const summary = text(row.description ?? row.summary);
  const cve = text(row.aliases).match(/\bCVE-\d{4}-\d+\b/)?.[0];
  return validEvent({ source: 'euvd', externalId: id, cveId: cve,
    title: `${text(row.title ?? row.summary, 300) || id} (EUVD)`, summary,
    url: `https://euvd.enisa.europa.eu/vulnerability/${encodeURIComponent(id)}`,
    publishedAt: isoDate(row.datePublished ?? row.published ?? row.publishedAt ?? row.date),
    updatedAt: isoDate(row.dateUpdated), sourceSeverity: severity(row.severity, row.baseScore),
    metadata: { aliases: row.aliases, references: row.references, baseScore: row.baseScore } });
}

function cisaEvent(value: unknown): SourceEvent {
  const row = jsonObject(value);
  const id = text(row.cveID, 100);
  return validEvent({ source: 'cisa_kev', externalId: id, cveId: id, title: `${id} (CISA KEV)`,
    url: `https://www.cve.org/CVERecord?id=${encodeURIComponent(id)}`,
    summary: `${text(row.vendorProject, 200)} ${text(row.product, 200)} - ${text(row.shortDescription)}`,
    publishedAt: isoDate(row.dateAdded), sourceSeverity: 'high', metadata: { requiredAction: row.requiredAction, dueDate: row.dueDate } });
}

async function snapshotPage(source: 'euvd' | 'cisa_kev' | 'rss', ctx: Context): Promise<SourcePage> {
  const url = source === 'cisa_kev' ? 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json'
    : source === 'euvd' ? 'https://euvdservices.enisa.europa.eu/api/lastvulnerabilities' : ctx.query;
  const response = await sourceRequest(ctx.fetchFn, url, ctx.timeout);
  if (source === 'rss') {
    if (!/<(?:rss|feed)[\s>]/i.test(response.body)) throw new Error('Invalid RSS/Atom feed');
    return { events: parseRssOrAtom(response.body, url).map((event) => validEvent({ ...event, publishedAt: isoDate(event.publishedAt) })), warnings: [] };
  }
  const body: unknown = JSON.parse(response.body);
  const rows = source === 'cisa_kev' ? jsonObject(body).vulnerabilities
    : Array.isArray(body) ? body : jsonObject(body).items ?? jsonObject(body).vulnerabilities;
  return { events: jsonArray(rows).map(source === 'cisa_kev' ? cisaEvent : euvdEvent), warnings: [] };
}

async function hnPage(ctx: Context): Promise<SourcePage> {
  const response = await sourceRequest(ctx.fetchFn, 'https://hacker-news.firebaseio.com/v0/topstories.json', ctx.timeout);
  const ids = jsonArray(JSON.parse(response.body)).slice(0, Math.min(20, Math.max(0, Number(ctx.env.HN_MAX_ITEMS ?? 8))));
  const events: SourceEvent[] = [];
  for (const id of ids) {
    const itemResponse = await sourceRequest(ctx.fetchFn, `https://hacker-news.firebaseio.com/v0/item/${Number(id)}.json`, ctx.timeout);
    const item = jsonObject(JSON.parse(itemResponse.body));
    if (item.type !== 'story' || !item.url || !item.title) continue;
    events.push(validEvent({ source: 'hn', externalId: String(id), title: text(item.title, 500), url: text(item.url, 1000),
      summary: text(item.text), publishedAt: typeof item.time === 'number' ? new Date(item.time * 1000).toISOString() : null }));
  }
  return { events, warnings: [] };
}

export function sourceQueries(source: SourceEvent['source'], env: EnvBindings): string[] {
  if (source === 'nvd') return NVD_QUERIES;
  if (source === 'rss') return (env.RSS_FEEDS ?? 'https://www.kb.cert.org/vuls/atomfeed/,https://cert.europa.eu/publications/security-advisories-rss').split(',').map((url) => url.trim()).filter(Boolean);
  return ['default'];
}

export async function fetchSourcePage(source: SourceEvent['source'], ctx: Context): Promise<SourcePage> {
  if (source === 'nvd') return nvdPage(ctx);
  if (source === 'ghsa') return ghsaPage(ctx);
  if (source === 'hn') return hnPage(ctx);
  return snapshotPage(source, ctx);
}
