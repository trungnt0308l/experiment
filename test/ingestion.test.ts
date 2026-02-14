import { describe, expect, test } from 'vitest';
import {
  isEventRecent,
  isLikelyAiSecurityIncident,
  parseRssOrAtom,
  resolveScheduledSources,
  resolveRuntimeCaps,
  runIngestionPipeline,
  shouldAutoPublish,
  scoreIncidentRelevance,
} from '../src/ingestion';

describe('ingestion helpers', () => {
  test('scores AI security text as relevant', () => {
    const score = scoreIncidentRelevance(
      'Prompt injection vulnerability found in enterprise LLM',
      'Security researchers disclosed data leak paths and exploit details.',
      'hn'
    );
    expect(score).toBeGreaterThanOrEqual(0.4);
  });

  test('rejects generic AI content without security context', () => {
    const relevant = isLikelyAiSecurityIncident(
      'New AI model release boosts benchmark scores',
      'The model improves coding and writing quality.',
      'hn'
    );
    expect(relevant).toBe(false);
    expect(scoreIncidentRelevance('New AI model release', 'Great benchmark results', 'hn')).toBe(0);
  });

  test('rejects HN noise posts even with weak security wording', () => {
    const relevant = isLikelyAiSecurityIncident(
      'Show HN: AI security benchmark dashboard',
      'A launch post for tracking benchmarks',
      'hn'
    );
    expect(relevant).toBe(false);
  });

  test('parses RSS feed items', () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title>AI model supply chain attack</title>
          <link>https://example.com/incidents/1</link>
          <description>Security team reports compromise.</description>
          <guid>incident-1</guid>
          <pubDate>Sat, 14 Feb 2026 12:00:00 GMT</pubDate>
        </item>
      </channel></rss>`;

    const items = parseRssOrAtom(xml, 'https://example.com/feed.xml');
    expect(items.length).toBe(1);
    expect(items[0]?.title).toContain('AI model supply chain attack');
    expect(items[0]?.source).toBe('rss');
  });

  test('normalizes relative RSS links against feed URL', () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title>AI incident with relative link</title>
          <link>/incidents/42</link>
          <description>Security disclosure</description>
          <guid>incident-42</guid>
          <pubDate>Sat, 14 Feb 2026 12:00:00 GMT</pubDate>
        </item>
      </channel></rss>`;

    const items = parseRssOrAtom(xml, 'https://example.com/security/feed.xml');
    expect(items[0]?.url).toBe('https://example.com/incidents/42');
  });

  test('returns DB error when pipeline runs without DB', async () => {
    const result = await runIngestionPipeline({});
    expect(result.errors).toContain('DB not configured');
    expect(result.inserted).toBe(0);
  });

  test('marks stale events as not recent', () => {
    const now = Date.parse('2026-02-14T12:00:00.000Z');
    const old = '2025-03-01T00:00:00.000Z';
    expect(isEventRecent(old, 60, now)).toBe(false);
    expect(isEventRecent('2026-02-10T00:00:00.000Z', 60, now)).toBe(true);
  });

  test('auto-publishes high severity incidents from trusted NVD source', () => {
    const ok = shouldAutoPublish(
      {
        source: 'nvd',
        externalId: 'CVE-2026-9999',
        title: 'CVE-2026-9999 critical AI exploit',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-9999',
        summary: 'Critical exploit',
        publishedAt: '2026-02-14T00:00:00.000Z',
        severity: 'high',
        confidence: 0.9,
        fingerprint: 'abc',
      },
      {}
    );
    expect(ok).toBe(true);
  });

  test('treats GHSA advisories as security-first and requires AI context', () => {
    const relevant = isLikelyAiSecurityIncident(
      'GHSA-xxxx prompt injection vulnerability in LLM plugin',
      'Security issue allows prompt injection and data exfiltration in AI workflows.',
      'ghsa'
    );
    expect(relevant).toBe(true);
    expect(scoreIncidentRelevance('GHSA release notes', 'General package update.', 'ghsa')).toBe(0);
  });

  test('does not auto-publish medium severity unless threshold lowered', () => {
    const event = {
      source: 'nvd' as const,
      externalId: 'CVE-2026-1000',
      title: 'CVE-2026-1000 medium',
      url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1000',
      summary: 'Medium issue',
      publishedAt: '2026-02-14T00:00:00.000Z',
      severity: 'medium' as const,
      confidence: 0.8,
      fingerprint: 'def',
    };
    expect(shouldAutoPublish(event, {})).toBe(false);
    expect(shouldAutoPublish(event, { AUTO_PUBLISH_MIN_SEVERITY: 'medium' })).toBe(true);
  });

  test('applies safe runtime cap defaults and clamps', () => {
    expect(resolveRuntimeCaps({})).toEqual({
      hnMaxItems: 8,
      llmDedupeMaxCalls: 6,
      llmEnrichMaxCalls: 2,
      ingestionMaxEventsPerRun: 36,
    });

    expect(
      resolveRuntimeCaps({
        HN_MAX_ITEMS: '999',
        LLM_DEDUPE_MAX_CALLS: '-1',
        LLM_ENRICH_MAX_CALLS: '50',
        INGESTION_MAX_EVENTS_PER_RUN: '999',
      })
    ).toEqual({
      hnMaxItems: 20,
      llmDedupeMaxCalls: 0,
      llmEnrichMaxCalls: 3,
      ingestionMaxEventsPerRun: 120,
    });
  });

  test('splits scheduled sources by timeslot and honors HN toggle', () => {
    const slot0 = resolveScheduledSources(0, true, true);
    const slot1 = resolveScheduledSources(30 * 60 * 1000, true, true);
    expect(Array.from(slot0).sort()).toEqual(['cisa_kev', 'ghsa', 'nvd']);
    expect(Array.from(slot1).sort()).toEqual(['euvd', 'hn', 'rss']);

    const slot1WithoutHn = resolveScheduledSources(30 * 60 * 1000, true, false);
    expect(Array.from(slot1WithoutHn).sort()).toEqual(['euvd', 'rss']);

    const allWhenDisabled = resolveScheduledSources(0, false, false);
    expect(Array.from(allWhenDisabled).sort()).toEqual(['cisa_kev', 'euvd', 'ghsa', 'nvd', 'rss']);
  });
});
