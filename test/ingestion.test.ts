import { describe, expect, test } from 'vitest';
import {
  compactSummaryText,
  isEventRecent,
  isLikelyAiSecurityIncident,
  normalizeLongSummaries,
  parseRssOrAtom,
  resolveRuntimeCaps,
  runIngestionPipeline,
  shouldAutoPublish,
  scoreIncidentRelevance,
  summarizeGitHubAdvisory,
} from '../src/ingestion';

function createNormalizationDbFixture() {
  const longEventSummary = `## Advisory\n\`\`\`js\nconsole.log("poc");\n\`\`\`\nAttackers can trigger AI model deserialization bypass and execute unsafe opcodes. ${'detail '.repeat(140)}`;
  const longDraftSummary = `### Draft rewrite\nAttackers can bypass trust checks in AI processing workflows. ${'context '.repeat(130)}\n\`\`\`python\nprint("debug")\n\`\`\``;
  const events = [
    { id: 1, summary: longEventSummary },
    { id: 2, summary: 'Short summary stays unchanged.' },
  ];
  const drafts = [
    { id: 10, enriched_summary: longDraftSummary },
    { id: 11, enriched_summary: 'Already short summary.' },
  ];

  const db = {
    prepare(sql: string) {
      const compactSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return {
        bind(...params: unknown[]) {
          return {
            all: async () => {
              if (compactSql.includes('from ingested_events') && compactSql.includes('length(summary) >')) {
                const threshold = Number(params[0] ?? 0);
                return { results: events.filter((row) => (row.summary ?? '').length > threshold) };
              }
              if (compactSql.includes('from draft_posts') && compactSql.includes('length(enriched_summary) >')) {
                const threshold = Number(params[0] ?? 0);
                return { results: drafts.filter((row) => (row.enriched_summary ?? '').length > threshold) };
              }
              throw new Error(`Unexpected all SQL: ${sql}`);
            },
            run: async () => {
              if (compactSql.startsWith('update ingested_events')) {
                const summary = String(params[0] ?? '');
                const id = Number(params[1]);
                const row = events.find((item) => item.id === id);
                if (!row) {
                  return { meta: { changes: 0 } };
                }
                row.summary = summary;
                return { meta: { changes: 1 } };
              }
              if (compactSql.startsWith('update draft_posts')) {
                const summary = String(params[0] ?? '');
                const id = Number(params[1]);
                const row = drafts.find((item) => item.id === id);
                if (!row) {
                  return { meta: { changes: 0 } };
                }
                row.enriched_summary = summary;
                return { meta: { changes: 1 } };
              }
              throw new Error(`Unexpected run SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, events, drafts };
}

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

  test('compacts markdown-heavy summaries into bounded plain text', () => {
    const raw = `## Incident detail\n\`\`\`bash\ncurl https://example.com\n\`\`\`\n- Attackers can exfiltrate model secrets through plugin abuse. ${'note '.repeat(120)}`;
    const compact = compactSummaryText(raw, 180);
    expect(compact).not.toContain('```');
    expect(compact).not.toContain('##');
    expect(compact).toContain('Attackers can exfiltrate model secrets');
    expect(compact.length).toBeLessThanOrEqual(183);
  });

  test('builds GHSA summaries as headline-first with one concise excerpt sentence', () => {
    const summary = 'Fickling obj opcode call invisibility bypass';
    const description = `## Impact\nAttackers can bypass invisibility checks in model pickle inspection.\n\n\`\`\`python\n# poc\n\`\`\`\nAdditional deep technical details follow in the advisory body.`;
    const parsed = summarizeGitHubAdvisory(summary, description, 260);

    expect(parsed.startsWith(summary)).toBe(true);
    expect(parsed).toContain('Attackers can bypass invisibility checks in model pickle inspection.');
    expect(parsed).not.toContain('```');
    expect(parsed.length).toBeLessThanOrEqual(263);
  });

  test('avoids duplicate GHSA excerpt when description repeats summary headline', () => {
    const summary = 'Prompt injection bypass in AI plugin authorization';
    const description = 'Prompt injection bypass in AI plugin authorization. Additional context appears after the headline.';
    const parsed = summarizeGitHubAdvisory(summary, description, 260);
    const duplicateMatches = parsed.match(/Prompt injection bypass in AI plugin authorization/g) ?? [];
    expect(duplicateMatches.length).toBe(1);
  });

  test('returns DB error when pipeline runs without DB', async () => {
    const result = await runIngestionPipeline({});
    expect(result.errors).toContain('DB not configured');
    expect(result.inserted).toBe(0);
  });

  test('normalizes legacy long summaries in events and draft enrichments', async () => {
    const fixture = createNormalizationDbFixture();
    const result = await normalizeLongSummaries(fixture.db, { thresholdChars: 220, maxChars: 240 });

    expect(result).toEqual({
      scannedEvents: 1,
      updatedEvents: 1,
      scannedDraftSummaries: 1,
      updatedDraftSummaries: 1,
      unchanged: 0,
      thresholdChars: 220,
      maxChars: 240,
    });
    expect((fixture.events[0]?.summary ?? '').length).toBeLessThanOrEqual(243);
    expect((fixture.events[0]?.summary ?? '')).not.toContain('```');
    expect((fixture.drafts[0]?.enriched_summary ?? '').length).toBeLessThanOrEqual(243);
    expect((fixture.drafts[0]?.enriched_summary ?? '')).not.toContain('```');
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
    });

    expect(
      resolveRuntimeCaps({
        HN_MAX_ITEMS: '999',
        LLM_DEDUPE_MAX_CALLS: '-1',
        LLM_ENRICH_MAX_CALLS: '50',
      })
    ).toEqual({
      hnMaxItems: 20,
      llmDedupeMaxCalls: 0,
      llmEnrichMaxCalls: 3,
    });
  });
});
