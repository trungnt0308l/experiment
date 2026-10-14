import { setTimeout as sleep } from 'node:timers/promises';

async function request(client, url, summarize, nvd) {
    const { fetchFn, wait, now, apiKey, log, onFailure, maxAttempts, spacing } = client;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (nvd && client.nextNvdAt > now()) await wait(client.nextNvdAt - now());
      if (nvd) client.nextNvdAt = now() + spacing;
      try {
        const headers = { 'User-Agent': 'ai-security-radar-audit', Accept: '*/*' };
        if (nvd && apiKey) headers.apiKey = apiKey;
        const response = await fetchFn(url, { signal: AbortSignal.timeout(20000), headers });
        if (response.ok) {
          log(JSON.stringify({ url, status: response.status, result: summarize(await response.text()) }));
          return true;
        }
        await response.body?.cancel();
        const seconds = Number(response.headers.get('retry-after') ?? NaN);
        const dateDelay = Date.parse(response.headers.get('retry-after') ?? '') - now();
        const delay = Math.max(spacing * 2 ** attempt, Number.isFinite(seconds) ? seconds * 1000 : dateDelay || 0);
        if (nvd && (response.status === 429 || response.status >= 500) && attempt + 1 < maxAttempts && delay <= 60000) {
          client.nextNvdAt = now() + delay;
          continue;
        }
        log(JSON.stringify({ url, status: response.status, error: 'Source check failed; evidence is incomplete' }));
      } catch (error) {
        log(JSON.stringify({ url, error: error.message }));
      }
      onFailure();
      return false;
    }
    onFailure();
    return false;
}

// One queue covers every NVD audit request, including retries.
export function createAuditClient({ fetchFn = fetch, wait = sleep, now = () => Date.now(),
  apiKey = process.env.NVD_API_KEY, log = console.log, onFailure = () => {}, maxAttempts = 3 } = {}) {
  const client = { fetchFn, wait, now, apiKey, log, onFailure, maxAttempts, spacing: apiKey ? 600 : 6000, nextNvdAt: 0 };
  let queue = Promise.resolve();
  return (url, summarize) => {
    if (new URL(url).origin !== 'https://services.nvd.nist.gov') return request(client, url, summarize, false);
    const result = queue.then(() => request(client, url, summarize, true));
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}
