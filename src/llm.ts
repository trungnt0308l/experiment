import type { EnvBindings } from './app';
import type { SourceEvent } from './ingestion';

export type DraftEnrichment = {
  summary: string;
  impact: string;
  remedy: string[];
  model: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
    }>;
  }>;
};

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-5-mini';

function trimTo(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return value.slice(0, max).trim();
}

function trimToSentence(value: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length <= max) {
    return normalized;
  }
  const clipped = normalized.slice(0, max).trim();
  const punctuation = Math.max(
    clipped.lastIndexOf('.'),
    clipped.lastIndexOf('!'),
    clipped.lastIndexOf('?')
  );
  if (punctuation >= Math.floor(max * 0.55)) {
    return clipped.slice(0, punctuation + 1).trim();
  }
  const lastSpace = clipped.lastIndexOf(' ');
  if (lastSpace >= Math.floor(max * 0.7)) {
    return `${clipped.slice(0, lastSpace).trim()}...`;
  }
  return `${clipped}...`;
}

function cleanupNarrative(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/!\[[^\]]*]\(([^)]+)\)/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/`{1,3}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }
  return null;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const block = extractJsonBlock(text);
  if (!block) {
    return null;
  }
  try {
    const parsed = JSON.parse(block) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
}

function openAiConfig(env: EnvBindings): { apiKey: string; baseUrl: string; model: string } | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  return {
    apiKey,
    baseUrl: (env.OPENAI_API_BASE_URL ?? DEFAULT_OPENAI_BASE_URL).replace(/\/+$/, ''),
    model: env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL,
  };
}

async function callOpenAiJson(
  env: EnvBindings,
  fetchFn: typeof fetch,
  systemPrompt: string,
  userPrompt: string
): Promise<{ json: Record<string, unknown>; model: string } | null> {
  const cfg = openAiConfig(env);
  if (!cfg) {
    return null;
  }

  const endpointOrder: Array<'responses' | 'chat'> =
    cfg.model.startsWith('gpt-5') || cfg.model.startsWith('o') ? ['responses', 'chat'] : ['chat', 'responses'];

  let lastError = 'OpenAI request failed';

  for (const endpoint of endpointOrder) {
    const payload =
      endpoint === 'responses'
        ? {
            model: cfg.model,
            input: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            max_output_tokens: 900,
            text: { format: { type: 'json_object' } },
          }
        : {
            model: cfg.model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            response_format: { type: 'json_object' },
          };

    const response = await fetchFn(`${cfg.baseUrl}/${endpoint === 'responses' ? 'responses' : 'chat/completions'}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      let detail = text;
      try {
        const parsed = JSON.parse(text) as { error?: { message?: string; code?: string; type?: string } };
        if (parsed?.error) {
          const pieces = [parsed.error.type, parsed.error.code, parsed.error.message].filter(Boolean);
          detail = pieces.join(' | ');
        }
      } catch {
        // keep raw body as detail
      }

      lastError = `OpenAI request failed: ${response.status}${detail ? ` - ${detail}` : ''}`;
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        throw new Error(lastError);
      }
      continue;
    }

    const raw = (await response.json()) as ChatCompletionResponse | ResponsesApiResponse;
    const content =
      endpoint === 'responses'
        ? (raw as ResponsesApiResponse).output_text ??
          ((raw as ResponsesApiResponse).output ?? [])
            .flatMap((item) => item.content ?? [])
            .map((item) => item.text ?? '')
            .join('\n')
        : (raw as ChatCompletionResponse).choices?.[0]?.message?.content ?? '';

    const parsed = parseJsonObject(content);
    if (!parsed) {
      lastError = 'OpenAI JSON parse failed';
      continue;
    }

    return { json: parsed, model: cfg.model };
  }

  throw new Error(lastError);
}

function normalizeSourcePair(a: SourceEvent, b: SourceEvent): string {
  return `${a.source}/${b.source}`;
}

function normalizeDuplicateBool(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    return normalized === 'true' || normalized === 'yes' || normalized === 'duplicate';
  }
  return false;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value === 'number') {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }
  return 0;
}

export async function llmDuplicateDecision(
  env: EnvBindings,
  incoming: SourceEvent,
  existing: SourceEvent,
  fetchFn: typeof fetch = fetch
): Promise<{ duplicate: boolean; confidence: number; reason: string; model: string } | null> {
  if ((env.LLM_DEDUPE_ENABLED ?? 'true').toLowerCase() !== 'true') {
    return null;
  }

  const system = [
    'You are a strict incident deduplication engine for AI security incident feeds.',
    'Return valid JSON only: {"duplicate": boolean, "confidence": number, "reason": string}.',
    'Mark duplicate true only when both records refer to the same incident, CVE, campaign, or disclosure event.',
    'Confidence must be a number between 0 and 1.',
  ].join(' ');

  const user = JSON.stringify(
    {
      pair: normalizeSourcePair(incoming, existing),
      incoming,
      existing,
      rules: [
        'Same CVE -> duplicate true',
        'Same campaign/event with different writeups -> duplicate true',
        'Same vendor family but different CVEs/events -> duplicate false',
      ],
    },
    null,
    2
  );

  const output = await callOpenAiJson(env, fetchFn, system, user);
  if (!output) {
    return null;
  }

  const duplicate = normalizeDuplicateBool(output.json.duplicate);
  const confidence = normalizeConfidence(output.json.confidence);
  const reason = trimTo(String(output.json.reason ?? ''), 240);

  return {
    duplicate,
    confidence,
    reason,
    model: output.model,
  };
}

function normalizeRemedyList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => trimTo(cleanupNarrative(String(item ?? '')), 180))
    .filter((item) => item.length > 0)
    .slice(0, 5);
}

export async function llmEnrichIncident(
  env: EnvBindings,
  event: SourceEvent & { severity?: string; confidence?: number },
  fetchFn: typeof fetch = fetch
): Promise<DraftEnrichment | null> {
  if ((env.LLM_ENRICH_ENABLED ?? 'true').toLowerCase() !== 'true') {
    return null;
  }

  const system = [
    'You rewrite AI security incident content for security teams in plain language.',
    'Return valid JSON only: {"summary": string, "impact": string, "remedy": string[]}.',
    'Use factual wording from provided source metadata; do not invent details.',
    'Do not include markdown headings, code blocks, HTML tags, PoC steps, exploit walkthroughs, or image markup.',
    'Prioritize: affected product/version, vulnerability class, attacker capability, and immediate risk.',
    'Remedy must be 3 to 5 actionable steps, each under 180 chars.',
  ].join(' ');

  const user = JSON.stringify(
    {
      incident: event,
      constraints: {
        summaryMaxChars: 700,
        impactMaxChars: 320,
        remedyItemsMin: 3,
        remedyItemsMax: 5,
      },
    },
    null,
    2
  );

  const output = await callOpenAiJson(env, fetchFn, system, user);
  if (!output) {
    return null;
  }

  const summary = trimToSentence(cleanupNarrative(String(output.json.summary ?? '')), 700);
  const impact = trimToSentence(cleanupNarrative(String(output.json.impact ?? '')), 320);
  const remedy = normalizeRemedyList(output.json.remedy);

  if (!summary || !impact || remedy.length < 3) {
    throw new Error('OpenAI enrichment payload invalid');
  }

  return {
    summary,
    impact,
    remedy,
    model: output.model,
  };
}
