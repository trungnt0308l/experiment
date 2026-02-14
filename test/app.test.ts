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
    expect(html).toContain('name="riskOption"');
  });

  test('accepts valid signup', async () => {
    const app = createApp();

    const form = new URLSearchParams({
      email: 'security@example.com',
      company: 'Acme Security',
      role: 'Security Engineer',
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

  test('rejects invalid payload', async () => {
    const app = createApp();

    const res = await app.request('http://localhost/api/waitlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', company: '', role: 'x', interests: '' }),
    }, makeEnv());

    expect(res.status).toBe(400);
    const body = (await res.json()) as WaitlistApiResponse;
    expect(body.ok).toBe(false);
  });

  test('returns already_joined for duplicate email', async () => {
    const app = createApp();

    const payload = {
      email: 'duplicate@example.com',
      company: 'Acme',
      role: 'Security Lead',
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
});
