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
    expect(html).toContain('href="/privacy"');
    expect(html).toContain('What delay can cost your organization');
    expect(html).toContain('https://www.ibm.com/security/data-breach');
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

  test('rejects unauthorized auto-publish backfill endpoint', async () => {
    const app = createApp();
    const res = await app.request('http://localhost/api/admin/ingestion/autopublish-backfill', { method: 'POST' }, makeEnv());
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

  test('returns DB not configured on auto-publish backfill endpoint', async () => {
    const app = createApp();
    const env = { APP_NAME: 'Test App', ADMIN_API_TOKEN: 'top-secret-token' };
    const res = await app.request(
      'http://localhost/api/admin/ingestion/autopublish-backfill',
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

    const form = new URLSearchParams({
      email: 'no-interests@example.com',
      source: 'test',
      utmSource: 'newsletter',
      utmMedium: 'email',
      utmCampaign: 'launch',
      referrer: 'direct',
      landingPath: '/',
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
