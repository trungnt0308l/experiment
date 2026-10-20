const FRESH_MS = 60000;
const STALE_MS = 24 * 3600000;
const CACHED_AT = 'x-radar-cached-at';

function publicPath(path: string): boolean {
  return path === '/' || path === '/sitemap.xml' || path === '/robots.txt'
    || /^\/(?:incidents(?:\/[^?]*)?|methodology|privacy|terms|security)$/.test(path);
}

export async function servePublicPage(request: Request, load: () => Promise<Response>, cache: Cache,
  waitUntil: (promise: Promise<unknown>) => void): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.search || !publicPath(url.pathname)
    || request.headers.has('Authorization') || request.headers.has('Cookie')) return load();
  let cached: Response | undefined;
  try { cached = await cache.match(request); } catch { /* Cache is an optional serving layer. */ }
  const age = cached ? Date.now() - Number(cached.headers.get(CACHED_AT)) : Infinity;
  if (cached && age >= 0 && age < FRESH_MS) return visibleResponse(cached);
  let response: Response;
  try { response = await load(); }
  catch (error) {
    if (cached && age >= 0 && age < STALE_MS) return visibleResponse(cached, true);
    throw error;
  }
  if (response.status >= 500 && cached && age >= 0 && age < STALE_MS) return visibleResponse(cached, true);
  if (response.status === 200 && !response.headers.has('Set-Cookie') && !/no-store|private/.test(response.headers.get('Cache-Control') ?? '')) {
    const stored = new Response(response.clone().body, response);
    stored.headers.set(CACHED_AT, String(Date.now()));
    stored.headers.set('Cache-Control', 'public, max-age=86400');
    waitUntil(cache.put(request, stored).catch(() => undefined));
  }
  return response;
}

function visibleResponse(cached: Response, stale = false): Response {
  const response = new Response(cached.body, cached);
  response.headers.delete(CACHED_AT);
  response.headers.set('Cache-Control', stale ? 'public, max-age=0, must-revalidate' : 'public, max-age=60');
  if (stale) response.headers.set('Warning', '110 - "Response is stale"');
  return response;
}
