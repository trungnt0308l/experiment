import { Hono } from 'hono';
import { z } from 'zod';
import { renderLandingPage } from './ui';

export type EnvBindings = {
  APP_NAME?: string;
  DB?: D1Database;
};

export type WaitlistSignup = {
  email: string;
  company: string;
  role: string;
  interests: string;
  source?: string;
};

const schema = z.object({
  email: z.string().email().max(200),
  company: z.string().min(2).max(120),
  role: z.string().min(2).max(120),
  interests: z.string().min(2).max(240),
  source: z.string().max(120).optional().or(z.literal('')),
});

class MemoryStore {
  private items = new Map<string, WaitlistSignup>();

  upsert(signup: WaitlistSignup): { inserted: boolean } {
    const key = signup.email.trim().toLowerCase();
    const exists = this.items.has(key);
    this.items.set(key, signup);
    return { inserted: !exists };
  }
}

const memoryStore = new MemoryStore();

function normalize(form: Record<string, string | undefined>): WaitlistSignup {
  return {
    email: form.email?.trim() ?? '',
    company: form.company?.trim() ?? '',
    role: form.role?.trim() ?? '',
    interests: form.interests?.trim() ?? '',
    source: form.source?.trim() || undefined,
  };
}

async function saveSignup(db: D1Database | undefined, signup: WaitlistSignup): Promise<{ inserted: boolean }> {
  if (!db) {
    return memoryStore.upsert(signup);
  }

  const now = new Date().toISOString();
  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO waitlist_signups (email, company, role, interests, source, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    )
    .bind(signup.email.toLowerCase(), signup.company, signup.role, signup.interests, signup.source ?? null, now)
    .run();

  return { inserted: result.success && (result.meta?.changes ?? 0) > 0 };
}

export function createApp() {
  const app = new Hono<{ Bindings: EnvBindings }>();

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/', (c) => {
    const appName = c.env.APP_NAME ?? 'AI Security Incident Radar';
    return c.html(renderLandingPage(appName));
  });

  app.post('/api/waitlist', async (c) => {
    const contentType = c.req.header('content-type') ?? '';

    let payload: Record<string, string | undefined> = {};

    if (contentType.includes('application/json')) {
      payload = (await c.req.json()) as Record<string, string | undefined>;
    } else {
      const body = await c.req.parseBody();
      payload = Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])
      );
    }

    const parsed = schema.safeParse(normalize(payload));
    if (!parsed.success) {
      return c.json(
        { ok: false, error: 'Invalid input', details: parsed.error.issues.map((i) => i.path.join('.')) },
        400
      );
    }

    const result = await saveSignup(c.env.DB, parsed.data);

    return c.json(
      {
        ok: true,
        status: result.inserted ? 'joined' : 'already_joined',
      },
      result.inserted ? 201 : 200
    );
  });

  return app;
}