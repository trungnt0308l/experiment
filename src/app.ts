import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { renderLandingPage } from './ui';

export type EnvBindings = {
  APP_NAME?: string;
  GA_MEASUREMENT_ID?: string;
  DB?: D1Database;
};

export type WaitlistSignup = {
  email: string;
  company: string;
  role: string;
  interests: string;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referrer?: string;
  landingPath?: string;
};

const schema = z.object({
  email: z.string().email().max(200),
  company: z.string().min(2).max(120),
  role: z.string().min(2).max(120),
  interests: z.string().min(2).max(240),
  source: z.string().max(120).optional().or(z.literal('')),
  utmSource: z.string().max(120).optional().or(z.literal('')),
  utmMedium: z.string().max(120).optional().or(z.literal('')),
  utmCampaign: z.string().max(120).optional().or(z.literal('')),
  referrer: z.string().max(500).optional().or(z.literal('')),
  landingPath: z.string().max(300).optional().or(z.literal('')),
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
    utmSource: form.utmSource?.trim() || undefined,
    utmMedium: form.utmMedium?.trim() || undefined,
    utmCampaign: form.utmCampaign?.trim() || undefined,
    referrer: form.referrer?.trim() || undefined,
    landingPath: form.landingPath?.trim() || undefined,
  };
}

async function saveSignup(db: D1Database | undefined, signup: WaitlistSignup): Promise<{ inserted: boolean }> {
  if (!db) {
    return memoryStore.upsert(signup);
  }

  const email = signup.email.toLowerCase();
  const exists = await db.prepare('SELECT 1 AS found FROM waitlist_signups WHERE email = ?1 LIMIT 1').bind(email).first();

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO waitlist_signups (
         email, company, role, interests, source, utm_source, utm_medium, utm_campaign, referrer, landing_path, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(email) DO UPDATE SET
         company = excluded.company,
         role = excluded.role,
         interests = excluded.interests,
         source = excluded.source,
         utm_source = excluded.utm_source,
         utm_medium = excluded.utm_medium,
         utm_campaign = excluded.utm_campaign,
         referrer = excluded.referrer,
         landing_path = excluded.landing_path`
    )
    .bind(
      email,
      signup.company,
      signup.role,
      signup.interests,
      signup.source ?? null,
      signup.utmSource ?? null,
      signup.utmMedium ?? null,
      signup.utmCampaign ?? null,
      signup.referrer ?? null,
      signup.landingPath ?? null,
      now
    )
    .run();

  return { inserted: !exists };
}

function toPayload(body: Record<string, string | File>): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(body).map(([k, v]) => [k, typeof v === 'string' ? v : String(v)])
  );
}

async function parsePayload(c: Context<{ Bindings: EnvBindings }>): Promise<Record<string, string | undefined>> {
  const contentType = c.req.header('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await c.req.json()) as Record<string, string | undefined>;
  }
  const body = await c.req.parseBody();
  return toPayload(body as Record<string, string | File>);
}

export function createApp() {
  const app = new Hono<{ Bindings: EnvBindings }>();

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/', (c) => {
    const appName = c.env.APP_NAME ?? 'AI Security Incident Radar';
    return c.html(renderLandingPage(appName, c.env.GA_MEASUREMENT_ID));
  });

  app.post('/api/waitlist', async (c) => {
    const payload = await parsePayload(c);

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