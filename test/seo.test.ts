import { afterEach, expect, test, vi } from 'vitest';
import { createApp } from '../src/app';
import { incidentSearchTitle } from '../src/ui';
import { seedIncidentRows } from './helpers/db';

afterEach(() => vi.useRealTimers());
const incident = { draft_id: 1, slug: 'llm-incident', title: 'LLM prompt injection vulnerability (GHSA-abcd-efgh-ijkl)',
  summary: 'A prompt injection vulnerability affects an LLM assistant and can expose connected data. Validate the vendor advisory and restrict affected tool access.',
  url: 'https://github.com/advisories/GHSA-abcd-efgh-ijkl', event_published_at: '2026-02-20T00:00:00Z',
  published_at: '2026-02-27T00:00:00Z', created_at: '2026-02-27T00:00:00Z' };
const jsonLd = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));

test('homepage has a single clear search title aligned with social metadata', async () => {
  const html = await (await createApp().request('/', {}, {})).text();
  expect([...html.matchAll(/<title>/g)]).toHaveLength(1);
  const title = html.match(/<title>(.*?)<\/title>/)![1];
  expect(title).toBe('AI Security Incident Monitoring | AI Security Radar');
  expect(html).toContain(`property="og:title" content="${title}"`);
});

test('detail schema cites real sources, shows breadcrumbs, and distinguishes publication from changes', async () => {
  const DB = seedIncidentRows([incident]);
  await DB.prepare('UPDATE draft_posts SET enriched_at=?1 WHERE id=1').bind('2026-02-28T00:00:00Z').run();
  const html = await (await createApp().request('/incidents/llm-incident', {}, { DB })).text();
  const article = jsonLd(html).find(item => item['@type'] === 'NewsArticle');
  expect(article.datePublished).toBe('2026-02-27T00:00:00.000Z');
  expect(article.dateModified).toBe('2026-02-28T00:00:00.000Z');
  expect(article.citation).toEqual([incident.url]);
  expect(article.publisher.name).toBe('AI Security Radar');
  const breadcrumbs = jsonLd(html).find(item => item['@type'] === 'BreadcrumbList');
  expect(breadcrumbs.itemListElement).toHaveLength(3);
  expect(html).toContain('aria-label="Breadcrumb"');
  expect([...html.matchAll(/<title>/g)]).toHaveLength(1);
  expect(html.match(/name="description" content="([^"]+)/)![1].length).toBeLessThanOrEqual(160);
});

test('sitemap dates reflect actual content changes and stay stable as the clock advances', async () => {
  vi.useFakeTimers();
  const DB = seedIncidentRows([incident]);
  await DB.prepare('UPDATE draft_posts SET enriched_at=?1 WHERE id=1').bind('2026-02-28T00:00:00Z').run();
  const app = createApp();
  const before = await (await app.request('/sitemap.xml', {}, { DB })).text();
  vi.advanceTimersByTime(3600000);
  const after = await (await app.request('/sitemap.xml', {}, { DB })).text();
  expect(after).toBe(before);
  expect(before).toContain('<lastmod>2026-02-28T00:00:00.000Z</lastmod>');
  expect(before.match(/<url>\s*<loc>[^<]*\/privacy<\/loc>([\s\S]*?)<\/url>/)![1]).not.toContain('lastmod');
});

test('archive pages have unique descriptions, self canonicals, and global list positions', async () => {
  const DB = seedIncidentRows(Array.from({ length: 12 }, (_, index) => ({ ...incident, draft_id: index + 1, slug: `llm-${index}` })));
  const app = createApp();
  const first = await (await app.request('/incidents', {}, { DB, SITE_URL: 'https://aisecurityradar.com' })).text();
  const second = await (await app.request('/incidents/page/2', {}, { DB, SITE_URL: 'https://aisecurityradar.com' })).text();
  expect(first.match(/name="description" content="([^"]+)/)![1]).not.toBe(second.match(/name="description" content="([^"]+)/)![1]);
  expect(second).toContain('rel="canonical" href="https://aisecurityradar.com/incidents/page/2"');
  expect(jsonLd(second).find(item => item['@type'] === 'CollectionPage').mainEntity.itemListElement[0].position).toBe(11);
  expect(second).toContain('<h1>Recent AI Security Incidents — Page 2</h1>');
});

test.each([['/incidents?page=1', '/incidents'], ['/incidents?page=2&utm_source=email', '/incidents/page/2?utm_source=email'],
  ['/methodology/', '/methodology']])('redirects duplicate URL %s to canonical path', async (path, location) => {
  const response = await createApp().request(path, {}, {});
  expect(response.status).toBe(301);
  expect(response.headers.get('Location')).toBe(location);
});

test.each(['/incidents/page/9007199254740993', '/incidents?page=', '/incidents/not-found', '//outside.example/'])('returns a nonindexable 404 for invalid public URL %s', async (path) => {
  const response = await createApp().request(path, {}, {});
  expect(response.status).toBe(404);
  expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
});

test('search titles preserve advisory identifiers while removing repetition and limiting length', () => {
  const title = incidentSearchTitle(`AI security incident: ${'A long affected assistant product name and vulnerability description '.repeat(3)} (GHSA-abcd-efgh-ijkl)`);
  expect(title).toContain('GHSA-abcd-efgh-ijkl');
  expect(title).not.toContain('AI security incident:');
  expect(title.length).toBeLessThanOrEqual(65);
});
