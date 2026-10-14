import { expect, test } from 'vitest';
import { createAuditClient } from '../.tasks/ingestion-audit-client.mjs';

const nvdUrl = 'https://services.nvd.nist.gov/rest/json/cves/2.0';

test('queues public NVD calls and spaces starts by six seconds', async () => {
  let time = 0;
  let active = 0;
  const starts = [];
  const inspect = createAuditClient({ apiKey: '', now: () => time, wait: async (ms) => { time += ms; }, log: () => {},
    fetchFn: async () => { expect(active++).toBe(0); starts.push(time); await Promise.resolve(); active--; return new Response('{}'); } });
  expect(await Promise.all(Array.from({ length: 7 }, () => inspect(nvdUrl, JSON.parse)))).toEqual(Array(7).fill(true));
  expect(starts).toEqual([0, 6000, 12000, 18000, 24000, 30000, 36000]);
});

test('retries throttled NVD requests after Retry-After and keeps other APIs independent', async () => {
  let time = 0;
  const calls = [];
  const inspect = createAuditClient({ apiKey: 'audit-test-key', now: () => time, wait: async (ms) => { time += ms; }, log: () => {},
    fetchFn: async (url, init) => {
      calls.push({ url, time, headers: init.headers });
      if (calls.length === 1) return new Response('', { status: 429, headers: { 'Retry-After': '10' } });
      return new Response('{}');
    } });
  expect(await inspect(nvdUrl, JSON.parse)).toBe(true);
  expect(calls[1].time).toBe(10000);
  expect(calls[0].headers.apiKey).toBe('audit-test-key');
  await inspect('https://api.github.com/advisories', JSON.parse);
  expect(calls[2].headers.apiKey).toBeUndefined();
});

test('reports incomplete evidence after bounded retries and does not wait through long cooldowns', async () => {
  let time = 0;
  let failures = 0;
  let calls = 0;
  const inspect = createAuditClient({ apiKey: '', now: () => time, wait: async (ms) => { time += ms; }, log: () => {},
    onFailure: () => { failures++; }, fetchFn: async () => { calls++; return new Response('', { status: 503 }); } });
  expect(await inspect(nvdUrl, JSON.parse)).toBe(false);
  expect(calls).toBe(3);
  expect(failures).toBe(1);
  const limited = createAuditClient({ log: () => {}, onFailure: () => { failures++; },
    fetchFn: async () => new Response('', { status: 429, headers: { 'Retry-After': '3600' } }) });
  expect(await limited(nvdUrl, JSON.parse)).toBe(false);
  expect(failures).toBe(2);
});

test('marks invalid response data and network errors as failed evidence', async () => {
  let failures = 0;
  for (const fetchFn of [async () => new Response('invalid json'), async () => { throw new Error('offline'); }]) {
    const inspect = createAuditClient({ fetchFn, log: () => {}, onFailure: () => { failures++; } });
    expect(await inspect(nvdUrl, JSON.parse)).toBe(false);
  }
  expect(failures).toBe(2);
});
