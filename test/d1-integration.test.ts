import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';
import { acquireLease, releaseLease, stageEvent } from '../src/ingestion-storage';
import { storeEvent, storeDraft, toStoredEvent, buildDraftPost } from '../src/ingestion';

test('all migrations and recovery primitives work with Cloudflare D1, including atomic lease ownership', async () => {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("ok")}}',
    compatibilityDate: '2026-02-14', d1Databases: ['DB'] }));
  try {
    const db = await mf.getD1Database('DB') as unknown as D1Database;
    for (const file of readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort())
      await db.batch(readFileSync(`migrations/${file}`, 'utf8').split(';').filter((sql) => sql.trim()).map((sql) => db.prepare(sql)));
    const now = new Date().toISOString();
    const leases = await Promise.all([acquireLease(db, 'first', now), acquireLease(db, 'second', now)]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    await releaseLease(db, leases[0] ? 'second' : 'first');
    expect(await acquireLease(db, 'third', now)).toBe(false);
    const event = { source: 'ghsa' as const, externalId: 'GHSA-d1', title: 'LLM critical security vulnerability',
      summary: 'LLM vulnerability enables remote code execution', publishedAt: now, url: 'https://github.com/advisories/GHSA-d1', sourceSeverity: 'high' as const };
    await stageEvent(db, event, false);
    await stageEvent(db, event, false);
    expect(await db.prepare('SELECT count(*) AS count FROM ingestion_items').first('count')).toBe(1);
    const stored = (await toStoredEvent(event))!;
    const inserted = await storeEvent(db, stored, now);
    const draft = buildDraftPost(stored, now, true);
    expect((await storeDraft(db, inserted.eventId, draft, now)).inserted).toBe(true);
    expect((await storeDraft(db, inserted.eventId, draft, now)).inserted).toBe(false);
  } finally { await mf.dispose(); }
}, 30000);
