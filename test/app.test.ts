import { describe, expect, test } from 'vitest';
import { createApp } from '../src/app';

type WaitlistApiResponse = {
  ok: boolean;
  status?: 'joined' | 'already_joined';
  error?: string;
  details?: string[];
};

function makeEnv() {
  return { APP_NAME: 'Test App' };
}

function makeSummaryNormalizationDb() {
  const events = [
    { id: 1, summary: `## Advisory\n\`\`\`js\nconsole.log("poc")\n\`\`\`\nLong advisory summary ${'token '.repeat(150)}` },
    { id: 2, summary: 'Short event summary.' },
  ];
  const drafts = [
    { id: 10, enriched_summary: `### Enriched\nLong enriched text ${'detail '.repeat(140)}\n\`\`\`python\nprint("x")\n\`\`\`` },
    { id: 11, enriched_summary: 'Short draft summary.' },
  ];

  return {
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
}

function makeLandingSampleDb(row: {
  headline?: string | null;
  title: string;
  summary: string | null;
  enriched_summary: string | null;
  url: string;
  source: string;
  severity: string | null;
}) {
  return {
    prepare(sql: string) {
      const compactSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!compactSql.includes('from draft_posts d') || !compactSql.includes('limit 1')) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }
      return {
        first: async () => row,
      };
    },
  } as unknown as D1Database;
}

function makeIncidentDetailDb(summary: string) {
  return {
    prepare(sql: string) {
      const compactSql = sql.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!compactSql.includes('from draft_posts d') || !compactSql.includes('join ingested_events e')) {
        throw new Error(`Unexpected SQL: ${sql}`);
      }
      return {
        all: async () => ({
          results: [
            {
              draft_id: 1,
              slug: 'sample-incident',
              headline: 'Sample Incident Headline',
              published_at: '2026-02-25T00:00:00.000Z',
              created_at: '2026-02-25T00:00:00.000Z',
              title: 'Sample Incident Headline',
              summary,
              url: 'https://example.com/advisory',
              source: 'ghsa',
              severity: 'high',
              confidence: 0.91,
              event_published_at: '2026-02-24T00:00:00.000Z',
              enriched_summary: null,
              enriched_impact: null,
              enriched_remedy_json: null,
            },
          ],
        }),
      };
    },
  } as unknown as D1Database;
}

describe('waitlist endpoint', () => {
  test('renders homepage with attribution fields', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/', undefined, makeEnv());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="utmSource"');
    expect(html).toContain('name="utmMedium"');
    expect(html).toContain('name="utmCampaign"');
    expect(html).not.toContain('name="riskOption"');
    expect(html).not.toContain('Which risks should we monitor for you?');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('No published incidents yet.');
    expect(html).toContain('A verified sample alert will appear here after the first published incident.');
    expect(html).not.toContain('/admin/ops');
    expect(html).not.toContain('AiFrame campaign: malicious AI browser extensions');
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
    expect(html).toContain('rel="canonical"');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(res.headers.get('content-security-policy')).toContain("img-src 'self' data: https:");
  });

  test('renders bounded, markdown-cleaned sample risk text on homepage', async () => {
    const app = createApp();
    const longMarkdownSummary = `## Impact\n\`\`\`bash\ncat payload\n\`\`\`\nAttackers can bypass model trust boundaries and execute unsafe operations. ${'detail '.repeat(180)}`;
    const env = {
      ...makeEnv(),
      DB: makeLandingSampleDb({
        headline: 'GHSA sample',
        title: 'GHSA sample',
        summary: longMarkdownSummary,
        enriched_summary: null,
        url: 'https://example.com/advisory',
        source: 'ghsa',
        severity: 'high',
      }),
    };

    const res = await app.request('http://localhost/', undefined, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Risk:');
    expect(html).not.toContain('```');
    expect(html).not.toContain('## Impact');
    const riskSnippet = html.match(/Risk:[^<]+/)?.[0] ?? '';
    expect(riskSnippet.length).toBeLessThanOrEqual(300);
  });

  test('bounds and cleans incident SEO description from long legacy summaries', async () => {
    const app = createApp();
    const longSummary = `## Advisory\n\`\`\`python\nprint("poc")\n\`\`\`\nAttackers can abuse model deserialization and bypass policy checks. ${'note '.repeat(220)}`;
    const env = {
      ...makeEnv(),
      DB: makeIncidentDetailDb(longSummary),
    };

    const res = await app.request('http://localhost/incidents/sample-incident', undefined, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    const metaDescription = html.match(/<meta name="description" content="([^"]+)"/)?.[1] ?? '';
    expect(metaDescription.length).toBeGreaterThan(10);
    expect(metaDescription.length).toBeLessThanOrEqual(300);
    expect(metaDescription).not.toContain('```');
    expect(metaDescription).not.toContain('##');
  });

  test('renders legal pages', async () => {
    const app = createApp();
    const privacy = await app.request('http://localhost/privacy', undefined, makeEnv());
    const terms = await app.request('http://localhost/terms', undefined, makeEnv());
    const security = await app.request('http://localhost/security', undefined, makeEnv());

    expect(privacy.status).toBe(200);
    expect(terms.status).toBe(200);
    expect(security.status).toBe(200);
  });

  test('renders admin ops page', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/admin/ops', undefined, makeEnv());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Admin Operations');
    expect(html).toContain('Run Ingestion Now');
    expect(html).toContain('Normalize Long Summaries');
    expect(html).not.toContain('Load Drafts');
  });

  test('renders admin metrics page', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/admin/metrics', undefined, makeEnv());
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Validation Metrics');
    expect(html).toContain('Load Metrics');
  });

  test('renders incidents pages', async () => {
    const app = createApp();
    const index = await app.request('http://localhost/incidents', undefined, makeEnv());
    expect(index.status).toBe(200);

    const detail = await app.request(
      'http://localhost/incidents/m365-copilot-echoleak-cve-2025-32711',
      undefined,
      makeEnv()
    );
    expect(detail.status).toBe(404);
  });

  test('serves sitemap and robots', async () => {
    const app = createApp();
    const env = { ...makeEnv(), SITE_URL: 'https://aisecurityradar.com' };
    const sitemap = await app.request('http://localhost/sitemap.xml', undefined, env);
    const robots = await app.request('http://localhost/robots.txt', undefined, env);

    expect(sitemap.status).toBe(200);
    expect(sitemap.headers.get('content-type')).toContain('application/xml');
    const sitemapText = await sitemap.text();
    expect(sitemapText).toContain('<urlset');
    expect(sitemapText).toContain('https://aisecurityradar.com/incidents');

    expect(robots.status).toBe(200);
    const robotsText = await robots.text();
    expect(robotsText).toContain('Sitemap: https://aisecurityradar.com/sitemap.xml');
    expect(robotsText).toContain('Disallow: /admin');
  });

  test('rejects unauthorized admin access', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/api/admin/signups', undefined, makeEnv());
    expect(res.status).toBe(401);
  });

  test('rejects query token for admin access', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request('http://localhost/api/admin/signups?token=top-secret-token', undefined, env);
    expect(res.status).toBe(401);
  });

  test('runs admin ingestion endpoint with bearer token', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/ingestion/run',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; result: { errors: string[] } };
    expect(body.ok).toBe(true);
    expect(body.result.errors).toContain('DB not configured');
  });

  test('returns JSON error when ingestion runtime throws', async () => {
    const app = createApp();
    const env = {
      APP_NAME: 'Test App',
      ADMIN_API_TOKEN: 'top-secret-token',
      DB: {} as unknown as D1Database,
    };

    const res = await app.request(
      'http://localhost/api/admin/ingestion/run',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );

    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  test('rejects unauthorized summary normalization endpoint access', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request('http://localhost/api/admin/ingestion/normalize-summaries', { method: 'POST' }, env);
    expect(res.status).toBe(401);
  });

  test('returns DB not configured on summary normalization endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/ingestion/normalize-summaries',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('normalizes long summaries via admin endpoint and returns counts', async () => {
    const app = createApp();
    const env = {
      APP_NAME: 'Test App',
      ADMIN_API_TOKEN: 'top-secret-token',
      DB: makeSummaryNormalizationDb(),
    };

    const res = await app.request(
      'http://localhost/api/admin/ingestion/normalize-summaries',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      result: {
        scannedEvents: number;
        updatedEvents: number;
        scannedDraftSummaries: number;
        updatedDraftSummaries: number;
        unchanged: number;
        thresholdChars: number;
        maxChars: number;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.result.scannedEvents).toBe(1);
    expect(body.result.updatedEvents).toBe(1);
    expect(body.result.scannedDraftSummaries).toBe(1);
    expect(body.result.updatedDraftSummaries).toBe(1);
    expect(body.result.thresholdChars).toBeGreaterThan(200);
    expect(body.result.maxChars).toBeGreaterThan(100);
  });

  test('returns DB not configured on drafts endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/drafts',
      {
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('returns DB not configured on ingestions endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/ingestions',
      {
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('returns DB not configured on admin metrics endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/metrics',
      {
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('returns DB not configured on create draft from ingestion endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/ingestions/1/create-draft',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('returns DB not configured on draft approve endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/drafts/1/approve',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('returns DB not configured on ingestion reset endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/ingestion/reset',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('returns DB not configured on incidents clear endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/incidents/clear',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('returns DB not configured on incident remove endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/incidents/1/remove',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer top-secret-token' },
      },
      env
    );
    expect(res.status).toBe(503);
  });

  test('accepts valid signup', async () => {
    const app = createApp();

    const form = new URLSearchParams({
      email: 'security@example.com',
      interests: 'Prompt injection and model supply chain risks',
      source: 'test',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'phase0',
      referrer: 'https://google.com',
      landingPath: '/?utm_source=google',
    });

    const res = await app.request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }, makeEnv());

    expect(res.status).toBe(201);
    const body = (await res.json()) as WaitlistApiResponse;
    expect(body.ok).toBe(true);
    expect(body.status).toBe('joined');
  });

  test('accepts valid signup without interests', async () => {
    const app = createApp();

    const res = await app.request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'email-only@example.com',
        source: 'landing-page',
      }),
    }, makeEnv());

    expect(res.status).toBe(201);
    const body = (await res.json()) as WaitlistApiResponse;
    expect(body.ok).toBe(true);
    expect(body.status).toBe('joined');
  });

  test('rejects invalid payload', async () => {
    const app = createApp();

    const res = await app.request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', interests: '' }),
    }, makeEnv());

    expect(res.status).toBe(400);
    const body = (await res.json()) as WaitlistApiResponse;
    expect(body.ok).toBe(false);
  });

  test('returns already_joined for duplicate email', async () => {
    const app = createApp();

    const payload = {
      email: 'duplicate@example.com',
      interests: 'Shadow AI',
      source: 'test',
    };

    const first = await app.request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }, makeEnv());

    const second = await app.request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }, makeEnv());

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const body = (await second.json()) as WaitlistApiResponse;
    expect(body.status).toBe('already_joined');
  });

  test('rate limits burst waitlist submissions from same client ip', async () => {
    const app = createApp();
    const headers = {
      'content-type': 'application/json',
      'cf-connecting-ip': '203.0.113.10',
    };

    let lastStatus = 0;
    for (let i = 0; i < 9; i += 1) {
      const res = await app.request(
        'http://localhost/api/waitlist',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            email: `limit-${i}@example.com`,
            interests: 'Shadow AI',
            source: 'test',
          }),
        },
        makeEnv()
      );
      lastStatus = res.status;
    }

    expect(lastStatus).toBe(429);
  });
});
