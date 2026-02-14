import { describe, expect, test } from 'vitest';
import { llmDuplicateDecision, llmEnrichIncident } from '../src/llm';

function makeMockFetch(content: string): typeof fetch {
  return (async () => {
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;
}

function makeEndpointAwareMockFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/responses')) {
      return new Response(
        JSON.stringify({
          output_text: '{"duplicate":true,"confidence":0.87,"reason":"same disclosure event"}',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"duplicate":false,"confidence":0.2,"reason":"different issue"}' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;
}

function makeResponses400ThenChat200Fetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/responses')) {
      return new Response(
        JSON.stringify({
          error: { type: 'invalid_request_error', message: 'responses endpoint not enabled' },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: '{"summary":"Incident summary","impact":"Security impact","remedy":["Step 1","Step 2","Step 3"]}' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;
}

describe('llm integration helpers', () => {
  test('returns null when OPENAI_API_KEY is missing', async () => {
    const result = await llmDuplicateDecision(
      {},
      {
        source: 'nvd',
        externalId: 'CVE-2026-1111',
        title: 'CVE-2026-1111 (NVD)',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1111',
        summary: 'AI prompt injection vulnerability',
        publishedAt: '2026-02-14T00:00:00.000Z',
      },
      {
        source: 'ghsa',
        externalId: 'GHSA-1111',
        title: 'GHSA-1111',
        url: 'https://github.com/advisories/GHSA-1111',
        summary: 'Same incident writeup',
        publishedAt: '2026-02-14T00:00:00.000Z',
      }
    );

    expect(result).toBeNull();
  });

  test('parses duplicate decision from model response', async () => {
    const fetchFn = makeMockFetch('{"duplicate":true,"confidence":0.91,"reason":"same CVE"}');
    const result = await llmDuplicateDecision(
      { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-5-mini' },
      {
        source: 'nvd',
        externalId: 'CVE-2026-1111',
        title: 'CVE-2026-1111 (NVD)',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1111',
        summary: 'AI prompt injection vulnerability',
        publishedAt: '2026-02-14T00:00:00.000Z',
      },
      {
        source: 'ghsa',
        externalId: 'GHSA-1111',
        title: 'Prompt injection in AI plugin',
        url: 'https://github.com/advisories/GHSA-1111',
        summary: 'same vulnerability, different source',
        publishedAt: '2026-02-14T00:00:00.000Z',
      },
      fetchFn
    );

    expect(result?.duplicate).toBe(true);
    expect(result?.confidence).toBeGreaterThan(0.8);
  });

  test('parses enrichment payload from model response', async () => {
    const fetchFn = makeMockFetch('```json\n{"summary":"Incident summary","impact":"Security impact","remedy":["Step 1","Step 2","Step 3"]}\n```');
    const result = await llmEnrichIncident(
      { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-5-mini' },
      {
        source: 'nvd',
        externalId: 'CVE-2026-2222',
        title: 'CVE-2026-2222 (NVD)',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-2222',
        summary: 'Critical AI security issue',
        publishedAt: '2026-02-14T00:00:00.000Z',
        severity: 'high',
        confidence: 0.94,
      },
      fetchFn
    );

    expect(result?.summary).toContain('Incident summary');
    expect(result?.remedy.length).toBeGreaterThanOrEqual(3);
  });

  test('supports /responses payload shape for gpt-5 models', async () => {
    const result = await llmDuplicateDecision(
      { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-5-mini' },
      {
        source: 'nvd',
        externalId: 'CVE-2026-1111',
        title: 'CVE-2026-1111 (NVD)',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-1111',
        summary: 'AI prompt injection vulnerability',
        publishedAt: '2026-02-14T00:00:00.000Z',
      },
      {
        source: 'ghsa',
        externalId: 'GHSA-1111',
        title: 'GHSA-1111',
        url: 'https://github.com/advisories/GHSA-1111',
        summary: 'Same incident writeup',
        publishedAt: '2026-02-14T00:00:00.000Z',
      },
      makeEndpointAwareMockFetch()
    );

    expect(result?.duplicate).toBe(true);
    expect(result?.confidence).toBeGreaterThan(0.8);
  });

  test('falls back to chat completions when /responses returns 400', async () => {
    const result = await llmEnrichIncident(
      { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-5-mini' },
      {
        source: 'nvd',
        externalId: 'CVE-2026-2222',
        title: 'CVE-2026-2222 (NVD)',
        url: 'https://nvd.nist.gov/vuln/detail/CVE-2026-2222',
        summary: 'Critical AI security issue',
        publishedAt: '2026-02-14T00:00:00.000Z',
        severity: 'high',
        confidence: 0.94,
      },
      makeResponses400ThenChat200Fetch()
    );

    expect(result?.summary).toContain('Incident summary');
    expect(result?.remedy.length).toBeGreaterThanOrEqual(3);
  });

  test('cleans markdown and script noise from enrichment output', async () => {
    const fetchFn = makeMockFetch(
      '{"summary":"### Summary Critical issue ![img](https://example.com/x.png)","impact":"<script>alert(1)</script>Impact text","remedy":["### Patch now","Rotate tokens","Monitor logs"]}'
    );
    const result = await llmEnrichIncident(
      { OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-5-mini' },
      {
        source: 'ghsa',
        externalId: 'GHSA-xyz',
        title: 'Sample advisory',
        url: 'https://github.com/advisories/GHSA-xyz',
        summary: 'Raw content',
        publishedAt: '2026-02-14T00:00:00.000Z',
      },
      fetchFn
    );

    expect(result?.summary).not.toContain('###');
    expect(result?.summary).not.toContain('![');
    expect(result?.impact).not.toContain('<script');
  });
});
