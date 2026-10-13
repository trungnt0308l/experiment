import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach } from 'vitest';

const databases: DatabaseSync[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  databases.push(sqlite);
  for (const file of readdirSync('migrations').filter((file) => file.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  function prepare(sql: string, params: unknown[] = []) {
    const indexes = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]) - 1);
    const query = sql.replace(/\?\d+/g, '?');
    const values = (indexes.length ? indexes.map((index) => params[index]) : params) as SQLInputValue[];
    const statement = () => sqlite.prepare(query);
    return {
      bind: (...bound: unknown[]) => prepare(sql, bound),
      async all() { return { success: true, results: statement().all(...values), meta: { changes: 0 } }; },
      async first(column?: string) {
        const row = statement().get(...values);
        return row ? column ? row[column] : row : null;
      },
      async run() {
        const result = statement().run(...values);
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
      },
    };
  }
  const db = { prepare, async batch(statements: Array<{ run: () => Promise<unknown> }>) {
    sqlite.exec('BEGIN');
    try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
    catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { db, sqlite,
    get state() {
      return new Map((sqlite.prepare('SELECT key,value,updated_at FROM ingestion_state').all() as Array<{ key: string; value: string; updated_at: string }>)
        .map((row) => [row.key, { value: row.value, updated_at: row.updated_at }]));
    },
    get events() {
      return sqlite.prepare('SELECT * FROM ingested_events ORDER BY id').all() as Array<{ id: number; source: string; external_id: string; summary: string; severity: string }>;
    },
  };
}

export function seedIncidentRows(rows: Array<Record<string, unknown>>): D1Database {
  const fixture = createTestDb();
  for (const row of rows) {
    const id = Number(row.draft_id ?? 1);
    fixture.sqlite.prepare(`INSERT INTO ingested_events
      (id,source,external_id,title,url,summary,published_at,severity,confidence,fingerprint,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, String(row.source ?? 'ghsa'), `fixture-${id}`,
      String(row.title), String(row.url), String(row.summary ?? ''), String(row.event_published_at),
      String(row.severity ?? 'medium'), Number(row.confidence ?? 0.8), `fixture-${id}`, String(row.created_at));
    fixture.sqlite.prepare(`INSERT INTO draft_posts
      (id,event_id,status,headline,linkedin_text,x_text,tags,slug,published_at,created_at,enriched_summary,enriched_impact,enriched_remedy_json)
      VALUES (?,?,'published',?,'','','',?,?,?,?,?,?)`).run(id, id, String(row.headline ?? row.title),
      String(row.slug), String(row.published_at), String(row.created_at), row.enriched_summary as string ?? null,
      row.enriched_impact as string ?? null, row.enriched_remedy_json as string ?? null);
  }
  return fixture.db;
}
