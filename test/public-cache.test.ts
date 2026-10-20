import { afterEach, expect, test, vi } from 'vitest';
import { servePublicPage } from '../src/public-cache';

afterEach(() => vi.useRealTimers());
function fixture() {
  const stored = new Map<string, Response>();
  const cache = { match: vi.fn(async (req: Request) => stored.get(req.url)?.clone()),
    put: vi.fn(async (req: Request, res: Response) => { stored.set(req.url, res.clone()); }) } as unknown as Cache;
  const pending: Promise<unknown>[] = [];
  return { cache, pending, waitUntil: (promise: Promise<unknown>) => { pending.push(promise); } };
}

test('public pages use fresh cached content and refresh after one minute', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const request = new Request('https://aisecurityradar.com/incidents');
  const load = vi.fn(async () => new Response('published archive'));
  await servePublicPage(request, load, f.cache, f.waitUntil);
  await Promise.all(f.pending);
  const fresh = await servePublicPage(request, load, f.cache, f.waitUntil);
  expect(await fresh.text()).toBe('published archive');
  expect(fresh.headers.has('x-radar-cached-at')).toBe(false);
  expect(load).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(60001);
  await servePublicPage(request, load, f.cache, f.waitUntil);
  expect(load).toHaveBeenCalledTimes(2);
});

test('a temporary database outage serves the last successful public page for at most one day', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const request = new Request('https://aisecurityradar.com/incidents/older-advisory');
  await servePublicPage(request, async () => new Response('source-cited incident'), f.cache, f.waitUntil);
  await Promise.all(f.pending);
  vi.advanceTimersByTime(120000);
  const outage = async () => new Response('database unavailable', { status: 500 });
  const stale = await servePublicPage(request, outage, f.cache, f.waitUntil);
  expect(stale.status).toBe(200);
  expect(stale.headers.get('Warning')).toContain('stale');
  expect(await stale.text()).toBe('source-cited incident');
  const thrown = await servePublicPage(request, async () => { throw new Error('database disconnected'); }, f.cache, f.waitUntil);
  expect(thrown.status).toBe(200);
  vi.advanceTimersByTime(24 * 3600000);
  expect((await servePublicPage(request, outage, f.cache, f.waitUntil)).status).toBe(500);
});

test.each(['/admin/ops', '/api/admin/ingestion/health', '/health', '/incidents?page=2'])('does not cache private or parameterized path %s', async (path) => {
  const f = fixture();
  await servePublicPage(new Request(`https://aisecurityradar.com${path}`), async () => new Response('private'), f.cache, f.waitUntil);
  expect(f.cache.match).not.toHaveBeenCalled();
  expect(f.cache.put).not.toHaveBeenCalled();
});

const credentialHeaders: Record<string, string>[] = [{ Authorization: 'Bearer test' }, { Cookie: 'session=test' }];
test.each(credentialHeaders)('bypasses cache for credential-bearing requests', async (headers) => {
  const f = fixture();
  await servePublicPage(new Request('https://aisecurityradar.com/', { headers }), async () => new Response('personal'), f.cache, f.waitUntil);
  expect(f.cache.put).not.toHaveBeenCalled();
});

test('never caches errors, redirects or responses with private state', async () => {
  const f = fixture();
  for (const response of [new Response('missing', { status: 404 }), new Response('', { status: 301 }),
    new Response('session', { headers: { 'Set-Cookie': 'session=test' } }), new Response('private', { headers: { 'Cache-Control': 'private' } })])
    await servePublicPage(new Request('https://aisecurityradar.com/'), async () => response, f.cache, f.waitUntil);
  expect(f.cache.put).not.toHaveBeenCalled();
});

test('cache failures leave normal rendering available', async () => {
  const f = fixture();
  vi.mocked(f.cache.match).mockRejectedValue(new Error('cache unavailable'));
  vi.mocked(f.cache.put).mockRejectedValue(new Error('cache unavailable'));
  const response = await servePublicPage(new Request('https://aisecurityradar.com/'), async () => new Response('live'), f.cache, f.waitUntil);
  await Promise.all(f.pending);
  expect(await response.text()).toBe('live');
});
