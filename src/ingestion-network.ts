const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export class SourceHttpError extends Error {
  public warnings: string[] = [];
  constructor(public status: number, public retryAfterMs: number, message: string) {
    super(message);
  }
}

export function retryDelay(headers: Headers, nowMs = Date.now()): number {
  const value = headers.get('retry-after');
  const seconds = value === null ? NaN : Number(value);
  const reset = Number(headers.get('x-ratelimit-reset') ?? 0) * 1000;
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value ?? '') - nowMs;
  return Math.min(24 * 3600000, Math.max(60000, Number.isFinite(delay) ? delay : reset - nowMs));
}

async function boundedBody(response: Response, signal: AbortSignal): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const abort = () => void reader.cancel('Response deadline exceeded');
  if (signal.aborted) { abort(); throw new Error('Response deadline exceeded'); }
  signal.addEventListener('abort', abort, { once: true });
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (signal.aborted) throw new Error('Response deadline exceeded');
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) throw new Error('Source response exceeds size limit');
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder().decode(bytes);
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => undefined);
  }
}

export async function sourceRequest(fetchFn: typeof fetch, url: string, timeoutMs: number,
  init: RequestInit = {}): Promise<{ body: string; headers: Headers; status: number }> {
  const controller = new AbortController();
  let rejectDeadline: (reason: Error) => void = () => undefined;
  const deadline = new Promise<never>((_resolve, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => { controller.abort(); rejectDeadline(new Error('Response deadline exceeded')); }, Math.max(1, timeoutMs));
  try {
    const response = await Promise.race([fetchFn(url, { ...init, signal: controller.signal }), deadline]);
    if (!response.ok) {
      await response.body?.cancel();
      throw new SourceHttpError(response.status, retryDelay(response.headers), `Source HTTP ${response.status}`);
    }
    return { body: await Promise.race([boundedBody(response, controller.signal), deadline]), headers: response.headers, status: response.status };
  } finally { clearTimeout(timer); }
}

export function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid source object');
  return value as Record<string, unknown>;
}

export function jsonArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid source list');
  return value;
}

export function isoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const candidate = /^\d{4}-\d{2}-\d{2}T/.test(trimmed) && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
    ? `${trimmed}Z` : /\b(?:AM|PM)$/i.test(trimmed) ? `${trimmed} UTC`
      : trimmed.replace(/ CEST$/, ' +0200').replace(/ CET$/, ' +0100');
  const ms = Date.parse(candidate);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function scoreSeverity(score: unknown): 'low' | 'medium' | 'high' | undefined {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 10) return undefined;
  return score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
}
