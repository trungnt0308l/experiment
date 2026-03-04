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

type InMemoryState = { value: string; updated_at: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function xmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/xml' },
  });
}

function createPipelineDbFixture() {
  const state = new Map<string, InMemoryState>();
  const events: Array<{
    id: number;
    source: string;
    external_id: string;
    title: string;
    url: string;
    summary: string;
    published_at: string | null;
    fingerprint: string;
  }> = [];
  const drafts = new Map<number, { id: number; event_id: number }>();
  let nextEventId = 1;
  let nextDraftId = 1;

  const db = {
    prepare(sql: string) {
      const compactSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      return {
        bind(...params: unknown[]) {
          return {
            all: async () => {
              if (
                compactSql.includes('from ingested_events') &&
                compactSql.includes('order by datetime(coalesce(published_at, created_at)) desc')
              ) {
                return {
                  results: [...events]
                    .sort((a, b) => Date.parse(b.published_at ?? '') - Date.parse(a.published_at ?? ''))
                    .slice(0, Number(params[0] ?? 120))
                    .map((row) => ({
                      source: row.source,
                      external_id: row.external_id,
                      title: row.title,
                      url: row.url,
                      summary: row.summary,
                      published_at: row.published_at,
                    })),
                };
              }
              throw new Error(`Unexpected all SQL: ${sql}`);
            },
            first: async () => {
              if (compactSql.startsWith('select id from ingested_events where fingerprint =')) {
                const fingerprint = String(params[0] ?? '');
                const row = events.find((item) => item.fingerprint === fingerprint);
                return row ? { id: row.id } : null;
              }
              if (compactSql.startsWith('select key, value, updated_at from ingestion_state')) {
                const key = String(params[0] ?? '');
                const row = state.get(key);
                if (!row) {
                  return null;
                }
                return { key, value: row.value, updated_at: row.updated_at };
              }
              if (compactSql.startsWith('select id from draft_posts where event_id =')) {
                const eventId = Number(params[0] ?? 0);
                const row = drafts.get(eventId);
                return row ? { id: row.id } : null;
              }
              throw new Error(`Unexpected first SQL: ${sql}`);
            },
            run: async () => {
              if (compactSql.startsWith('insert into ingested_events')) {
                const fingerprint = String(params[8] ?? '');
                const existing = events.find((item) => item.fingerprint === fingerprint);
                if (existing) {
                  return { meta: { changes: 0 } };
                }
                events.push({
                  id: nextEventId,
                  source: String(params[0] ?? 'rss'),
                  external_id: String(params[1] ?? ''),
                  title: String(params[2] ?? ''),
                  url: String(params[3] ?? ''),
                  summary: String(params[4] ?? ''),
                  published_at: params[5] ? String(params[5]) : null,
                  fingerprint,
                });
                nextEventId += 1;
                return { meta: { changes: 1 } };
              }
              if (compactSql.startsWith('insert into draft_posts')) {
                const eventId = Number(params[0] ?? 0);
                if (drafts.has(eventId)) {
                  return { meta: { changes: 0 } };
                }
                drafts.set(eventId, { id: nextDraftId, event_id: eventId });
                nextDraftId += 1;
                return { meta: { changes: 1 } };
              }
              if (compactSql.includes('insert into ingestion_state') && compactSql.includes('where datetime(ingestion_state.updated_at) <=')) {
                const key = String(params[0] ?? '');
                const value = String(params[1] ?? '');
                const nowIso = String(params[2] ?? '');
                const expiryIso = String(params[3] ?? '');
                const existing = state.get(key);
                if (!existing || Date.parse(existing.updated_at) <= Date.parse(expiryIso)) {
                  state.set(key, { value, updated_at: nowIso });
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (compactSql.includes('insert into ingestion_state')) {
                const key = String(params[0] ?? '');
                const value = String(params[1] ?? '');
                const nowIso = String(params[2] ?? '');
                state.set(key, { value, updated_at: nowIso });
                return { meta: { changes: 1 } };
              }
              if (compactSql.startsWith('delete from ingestion_state where key =')) {
                const key = String(params[0] ?? '');
                const removed = state.delete(key);
                return { meta: { changes: removed ? 1 : 0 } };
              }
              throw new Error(`Unexpected run SQL: ${sql}`);
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, state, events };
}

function createFetchStub(input: {
  nvd?: Array<{ id: string; published: string; summary?: string }>;
  nvdStatus?: number;
  cisa?: Array<{ cveID: string; shortDescription?: string; dateAdded?: string }>;
  euvd?: Array<Record<string, unknown>>;
  ghsa?: Array<Record<string, unknown>>;
  rssItems?: string;
  holdFirstNvd?: Promise<void>;
  observedUrls?: string[];
} = {}): typeof fetch {
  return (async (request: RequestInfo | URL) => {
    const url = String(request);
    input.observedUrls?.push(url);
    if (url.includes('services.nvd.nist.gov')) {
      if (input.holdFirstNvd) {
        const hold = input.holdFirstNvd;
        input.holdFirstNvd = undefined;
        await hold;
      }
      if (input.nvdStatus && input.nvdStatus >= 400) {
        return jsonResponse({}, input.nvdStatus);
      }
      return jsonResponse({
        vulnerabilities: (input.nvd ?? []).map((item) => ({
          cve: {
            id: item.id,
            published: item.published,
            descriptions: [{ lang: 'en', value: item.summary ?? 'AI security incident summary' }],
          },
        })),
      });
    }
    if (url.includes('known_exploited_vulnerabilities.json')) {
      return jsonResponse({ vulnerabilities: input.cisa ?? [] });
    }
    if (url.includes('euvdservices.enisa.europa.eu')) {
      return jsonResponse(input.euvd ?? []);
    }
    if (url.includes('api.github.com/advisories')) {
      return jsonResponse(input.ghsa ?? []);
    }
    if (url.includes('hacker-news.firebaseio.com')) {
      return jsonResponse([]);
    }
    return xmlResponse(input.rssItems ?? '<?xml version="1.0"?><rss><channel></channel></rss>');
  }) as typeof fetch;
}

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
    expect(result.mode).toBe('manual');
    expect(result.errors).toContain('DB not configured');
    expect(result.inserted).toBe(0);
  });

  test('cron mode skips overlapping run with active lock', async () => {
    const fixture = createPipelineDbFixture();
    let releaseFirstNvdFetch = () => {};
    const holdFirstNvd = new Promise<void>((resolve) => {
      releaseFirstNvdFetch = resolve;
    });

    const env = {
      DB: fixture.db,
      ENABLE_HN_SOURCE: 'false',
      RSS_FEEDS: 'https://example.com/feed.xml',
    };

    const firstRun = runIngestionPipeline(env, createFetchStub({ holdFirstNvd }), { mode: 'cron', runId: 'cron-run-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const secondRun = await runIngestionPipeline(env, createFetchStub(), { mode: 'cron', runId: 'cron-run-2' });
    expect(secondRun.lockSkipped).toBe(true);
    expect(secondRun.mode).toBe('cron');

    releaseFirstNvdFetch();
    await firstRun;
  });

  test('stops on event budget and advances cursor through processed events only', async () => {
    const fixture = createPipelineDbFixture();
    const env = {
      DB: fixture.db,
      ENABLE_HN_SOURCE: 'false',
      RSS_FEEDS: 'https://example.com/feed.xml',
      AUTO_PUBLISH_TRUSTED_SOURCES: '',
      INGEST_CRON_MAX_PROCESS_EVENTS: '1',
      INGEST_CRON_DISABLE_LLM_DEDUPE: 'true',
    };

    const result = await runIngestionPipeline(
      env,
      createFetchStub({
        nvd: [
          { id: 'CVE-2026-1001', published: '2026-02-10T00:00:00.000Z', summary: 'AI model exploit vulnerability' },
          { id: 'CVE-2026-1002', published: '2026-02-11T00:00:00.000Z', summary: 'Prompt injection in AI workflow' },
        ],
      }),
      { mode: 'cron', runId: 'cron-budget-test' }
    );

    expect(result.stopReason).toBe('event_budget');
    expect(result.processed).toBe(1);
    expect(result.queuedForNextRun).toBeGreaterThan(0);
    const cursorRaw = fixture.state.get('cursor:nvd')?.value ?? '';
    expect(cursorRaw).toContain('2026-02-10T00:00:00.000Z');
  });

  test('stops on runtime budget', async () => {
    const fixture = createPipelineDbFixture();
    const baseFetch = createFetchStub({
      nvd: [{ id: 'CVE-2026-2001', published: '2026-02-12T00:00:00.000Z', summary: 'AI model compromise vulnerability' }],
    });
    const slowFetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 8));
      return baseFetch(request, init);
    }) as typeof fetch;

    const result = await runIngestionPipeline(
      {
        DB: fixture.db,
        ENABLE_HN_SOURCE: 'false',
        RSS_FEEDS: 'https://example.com/feed.xml',
        INGEST_CRON_MAX_RUNTIME_MS: '1',
        INGEST_CRON_DISABLE_LLM_DEDUPE: 'true',
      },
      slowFetch,
      { mode: 'cron', runId: 'cron-runtime-test' }
    );

    expect(result.stopReason).toBe('runtime_budget');
    expect(result.mode).toBe('cron');
  });

  test('continues sequential source processing after one source fetch failure', async () => {
    const fixture = createPipelineDbFixture();
    const seenUrls: string[] = [];
    const baseFetch = createFetchStub({
      cisa: [
        {
          cveID: 'CVE-2026-3001',
          shortDescription: 'AI plugin vulnerability enables exploit path',
          dateAdded: '2026-02-15T00:00:00.000Z',
        },
      ],
      observedUrls: seenUrls,
    });

    const fetchWithNvdFailure = (async (request: RequestInfo | URL, init?: RequestInit) => {
      const url = String(request);
      if (url.includes('services.nvd.nist.gov')) {
        throw new Error('nvd temporary failure');
      }
      return baseFetch(request, init);
    }) as typeof fetch;

    const result = await runIngestionPipeline(
      {
        DB: fixture.db,
        ENABLE_HN_SOURCE: 'false',
        RSS_FEEDS: 'https://example.com/feed.xml',
      },
      fetchWithNvdFailure,
      { mode: 'manual', runId: 'manual-sequential-test' }
    );

    expect(result.errors.some((item) => item.includes('nvd temporary failure'))).toBe(true);
    expect(result.sourceStats.nvd.errors).toBeGreaterThan(0);
    expect(result.sourceStats.cisa_kev.fetched).toBeGreaterThanOrEqual(1);
    expect(seenUrls.some((url) => url.includes('known_exploited_vulnerabilities.json'))).toBe(true);
  });

  test('uses GHSA source severity to auto-publish high advisories in cron runs', async () => {
    const fixture = createPipelineDbFixture();
    const result = await runIngestionPipeline(
      {
        DB: fixture.db,
        ENABLE_HN_SOURCE: 'false',
        RSS_FEEDS: 'https://example.com/feed.xml',
        AUTO_PUBLISH_TRUSTED_SOURCES: 'ghsa',
      },
      createFetchStub({
        ghsa: [
          {
            ghsa_id: 'GHSA-xxxx-yyyy-zzzz',
            summary: 'AI plugin vulnerability in model dependency',
            description: 'Security advisory for an AI workflow package update.',
            html_url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
            published_at: '2026-02-20T00:00:00.000Z',
            severity: 'high',
          },
        ],
      }),
      { mode: 'cron', runId: 'cron-ghsa-high-autopublish' }
    );

    expect(result.sourceStats.ghsa.inserted).toBe(1);
    expect(result.draftsCreated).toBe(1);
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

  test('auto-publishes high severity incidents from trusted GHSA source by default', () => {
    const ok = shouldAutoPublish(
      {
        source: 'ghsa',
        externalId: 'GHSA-xxxx-yyyy-zzzz',
        title: 'Model dependency vulnerability',
        url: 'https://github.com/advisories/GHSA-xxxx-yyyy-zzzz',
        summary: 'Security advisory for AI workflow package.',
        publishedAt: '2026-02-14T00:00:00.000Z',
        severity: 'high',
        confidence: 0.9,
        fingerprint: 'ghsa',
      },
      {}
    );
    expect(ok).toBe(true);
  });

  test('auto-publishes high severity incidents from RSS source by default', () => {
    const ok = shouldAutoPublish(
      {
        source: 'rss',
        externalId: 'rss-security-1',
        title: 'Critical AI security bulletin',
        url: 'https://example.com/security/rss-1',
        summary: 'Critical issue with exploit path in AI deployment.',
        publishedAt: '2026-02-14T00:00:00.000Z',
        severity: 'high',
        confidence: 0.88,
        fingerprint: 'rss-high',
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
    const manual = resolveRuntimeCaps({}, 'manual');
    expect(manual.maxRuntimeMs).toBe(45000);
    expect(manual.maxProcessEvents).toBe(200);
    expect(manual.maxDbWrites).toBe(600);
    expect(manual.hnMaxItems).toBe(8);
    expect(manual.llmDedupeMaxCalls).toBe(6);
    expect(manual.llmEnrichMaxCalls).toBe(2);

    const cron = resolveRuntimeCaps({ INGEST_CRON_DISABLE_LLM_DEDUPE: 'true' }, 'cron');
    expect(cron.maxRuntimeMs).toBe(20000);
    expect(cron.maxProcessEvents).toBe(60);
    expect(cron.maxDbWrites).toBe(180);
    expect(cron.fetchTimeoutMs).toBe(8000);
    expect(cron.llmDedupeMaxCalls).toBe(0);

    const clamped = resolveRuntimeCaps(
      {
        INGEST_CRON_MAX_RUNTIME_MS: '999999',
        INGEST_CRON_MAX_PROCESS_EVENTS: '1',
        INGEST_CRON_MAX_DB_WRITES: '-1',
        INGEST_CRON_FETCH_TIMEOUT_MS: '100',
        HN_MAX_ITEMS: '999',
        INGEST_CISA_MAX_ITEMS_PER_RUN: '999',
        INGEST_EUVD_MAX_ITEMS_PER_RUN: '999',
        INGEST_GHSA_MAX_ITEMS_PER_RUN: '999',
        INGEST_RSS_MAX_ITEMS_PER_FEED: '999',
        INGEST_NVD_RESULTS_PER_KEYWORD: '0',
        LLM_DEDUPE_MAX_CALLS: '-1',
        LLM_ENRICH_MAX_CALLS: '50',
      },
      'cron'
    );
    expect(clamped.maxRuntimeMs).toBe(55000);
    expect(clamped.maxProcessEvents).toBe(1);
    expect(clamped.maxDbWrites).toBe(1);
    expect(clamped.fetchTimeoutMs).toBe(100);
    expect(clamped.hnMaxItems).toBe(20);
    expect(clamped.cisaMaxItemsPerRun).toBe(250);
    expect(clamped.euvdMaxItemsPerRun).toBe(250);
    expect(clamped.ghsaMaxItemsPerRun).toBe(120);
    expect(clamped.rssMaxItemsPerFeed).toBe(80);
    expect(clamped.nvdResultsPerKeyword).toBe(2);
    expect(clamped.llmDedupeMaxCalls).toBe(0);
    expect(clamped.llmEnrichMaxCalls).toBe(3);
  });
});
