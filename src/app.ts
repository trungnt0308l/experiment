import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import {
  renderIncidentDetailPage,
  renderIncidentsPage,
  renderLandingPage,
  renderPrivacyPage,
  renderSecurityPage,
  renderTermsPage,
} from './ui';

export type EnvBindings = {
  APP_NAME?: string;
  GA_MEASUREMENT_ID?: string;
  ADMIN_API_TOKEN?: string;
  RESEND_API_KEY?: string;
  NOTIFY_EMAIL_TO?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
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

type SignupRow = {
  email: string;
  company: string;
  role: string;
  interests: string;
  source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  landing_path: string | null;
  created_at: string;
};

type IncidentSource = {
  label: string;
  url: string;
};

type IncidentEntry = {
  slug: string;
  title: string;
  incidentDate: string;
  publishedDate: string;
  summary: string;
  impact: string;
  remedy: string[];
  sources: IncidentSource[];
};

const recentIncidents: IncidentEntry[] = [
  {
    slug: 'm365-copilot-echoleak-cve-2025-32711',
    title: 'Microsoft 365 Copilot EchoLeak (CVE-2025-32711)',
    incidentDate: 'May 31, 2025',
    publishedDate: 'May 31, 2025',
    summary:
      'Aim Labs reported a zero-click prompt-injection chain in Microsoft 365 Copilot that could exfiltrate sensitive enterprise context without explicit user interaction.',
    impact:
      'Potential unauthorized disclosure of internal enterprise data across Microsoft 365 context windows.',
    remedy: [
      'Apply Microsoft June 2025 security updates for Copilot-related components.',
      'Reduce Copilot access scope for high-sensitivity repositories and mailboxes.',
      'Add detection for suspicious prompt patterns and anomalous outbound exfiltration behavior.',
    ],
    sources: [
      { label: 'Aim Security EchoLeak disclosure', url: 'https://www.aim.security/post/echoleak-blogpost' },
      { label: 'EchoLeak paper (arXiv)', url: 'https://arxiv.org/abs/2509.10540' },
    ],
  },
  {
    slug: 'copilot-reprompt-single-click-exfiltration',
    title: 'Microsoft Copilot Reprompt single-click exfiltration',
    incidentDate: 'January 14, 2026',
    publishedDate: 'January 14, 2026',
    summary:
      'Varonis Threat Labs disclosed Reprompt, a single-click chain that used Copilot URL prompt parameters and follow-up request techniques for stealthy data exfiltration.',
    impact:
      'Session-level data exposure risk from a single malicious link click in vulnerable Copilot contexts.',
    remedy: [
      'Confirm January 2026 Microsoft patches are applied in affected environments.',
      'Block and monitor suspicious Copilot URL patterns with embedded prompt parameters.',
      'Harden anti-phishing controls and user awareness for AI-assisted link payloads.',
    ],
    sources: [
      { label: 'Varonis Reprompt disclosure', url: 'https://www.varonis.com/blog/reprompt' },
      { label: 'SecurityWeek coverage', url: 'https://www.securityweek.com/new-reprompt-attack-silently-siphons-microsoft-copilot-data/' },
    ],
  },
  {
    slug: 'deepseek-cloud-db-exposure',
    title: 'DeepSeek cloud database exposure',
    incidentDate: 'January 2025',
    publishedDate: 'March 18, 2025',
    summary:
      'Wiz research identified a publicly exposed DeepSeek ClickHouse instance with sensitive records, including logs and keys; the instance was secured after disclosure.',
    impact:
      'Risk of large-scale leakage of user-related and operational data due to cloud misconfiguration.',
    remedy: [
      'Enforce private network boundaries and IP restrictions for production databases.',
      'Require strong authentication and disable default/no-password access modes.',
      'Continuously audit internet-exposed database services with alerting.',
    ],
    sources: [
      { label: 'Wiz + ClickHouse post-incident analysis', url: 'https://www.wiz.io/blog/clickhouse-and-wiz' },
      { label: 'The Verge incident summary', url: 'https://www.theverge.com/news/603163/deepseek-breach-ai-security-database-exposed' },
    ],
  },
];

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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toCsv(rows: SignupRow[]): string {
  const headers = [
    'email',
    'company',
    'role',
    'interests',
    'source',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'referrer',
    'landing_path',
    'created_at',
  ];

  const escapeCsv = (value: string | null): string => {
    const raw = value ?? '';
    if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
      return `"${raw.replaceAll('"', '""')}"`;
    }
    return raw;
  };

  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push([
      row.email,
      row.company,
      row.role,
      row.interests,
      row.source,
      row.utm_source,
      row.utm_medium,
      row.utm_campaign,
      row.referrer,
      row.landing_path,
      row.created_at,
    ].map(escapeCsv).join(','));
  }

  return `${lines.join('\n')}\n`;
}

function renderAdminPage(rows: SignupRow[]): string {
  const bodyRows = rows
    .map((row) => {
      const safe = {
        email: escapeHtml(row.email),
        company: escapeHtml(row.company),
        role: escapeHtml(row.role),
        interests: escapeHtml(row.interests),
        source: escapeHtml(row.source ?? ''),
        utm: escapeHtml([row.utm_source, row.utm_medium, row.utm_campaign].filter(Boolean).join(' / ')),
        created_at: escapeHtml(row.created_at),
      };
      return `<tr>
        <td>${safe.created_at}</td>
        <td>${safe.email}</td>
        <td>${safe.company}</td>
        <td>${safe.role}</td>
        <td>${safe.interests}</td>
        <td>${safe.source}</td>
        <td>${safe.utm}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Signup Admin</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; font-size: 13px; }
    th { background: #f5f5f5; text-align: left; }
    h1 { margin: 0 0 14px; }
    .actions { margin-bottom: 12px; }
  </style>
</head>
<body>
  <h1>Waitlist Signups</h1>
  <div class="actions">Use <code>/api/admin/signups?format=csv</code> for export.</div>
  <table>
    <thead>
      <tr>
        <th>Created At</th>
        <th>Email</th>
        <th>Company</th>
        <th>Role</th>
        <th>Interests</th>
        <th>Source</th>
        <th>UTM</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`;
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

function getAdminToken(c: Context<{ Bindings: EnvBindings }>): string | null {
  const authHeader = c.req.header('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const token = c.req.query('token');
  return token ?? null;
}

function isAdminAuthorized(c: Context<{ Bindings: EnvBindings }>): boolean {
  const expected = c.env.ADMIN_API_TOKEN;
  if (!expected) {
    return false;
  }
  return getAdminToken(c) === expected;
}

function runBackground(c: Context<{ Bindings: EnvBindings }>, promise: Promise<void>): Promise<void> {
  try {
    const ctx = c.executionCtx;
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(promise);
      return Promise.resolve();
    }
  } catch {
    // Test environment may not expose an execution context.
  }
  return promise;
}

async function sendEmailNotification(env: EnvBindings, signup: WaitlistSignup): Promise<void> {
  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL_TO) {
    return;
  }

  const payload = {
    from: 'AI Security Radar <alerts@aisecurityradar.com>',
    to: [env.NOTIFY_EMAIL_TO],
    subject: `New waitlist signup: ${signup.email}`,
    text: [
      `Email: ${signup.email}`,
      `Company: ${signup.company}`,
      `Role: ${signup.role}`,
      `Interests: ${signup.interests}`,
      `Source: ${signup.source ?? ''}`,
      `UTM: ${signup.utmSource ?? ''}/${signup.utmMedium ?? ''}/${signup.utmCampaign ?? ''}`,
    ].join('\n'),
  };

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

async function sendTelegramNotification(env: EnvBindings, signup: WaitlistSignup): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return;
  }

  const text = [
    'New waitlist signup',
    `Email: ${signup.email}`,
    `Company: ${signup.company}`,
    `Role: ${signup.role}`,
    `Risks: ${signup.interests}`,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
  });
}

async function notifySignup(env: EnvBindings, signup: WaitlistSignup): Promise<void> {
  await Promise.allSettled([
    sendEmailNotification(env, signup),
    sendTelegramNotification(env, signup),
  ]);
}

export function createApp() {
  const app = new Hono<{ Bindings: EnvBindings }>();

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/', (c) => {
    const appName = c.env.APP_NAME ?? 'AI Security Incident Radar';
    return c.html(renderLandingPage(appName, c.env.GA_MEASUREMENT_ID));
  });

  app.get('/incidents', (c) => c.html(renderIncidentsPage(recentIncidents)));
  app.get('/incidents/:slug', (c) => {
    const slug = c.req.param('slug');
    const incident = recentIncidents.find((item) => item.slug === slug);
    if (!incident) {
      return c.text('Incident not found', 404);
    }
    return c.html(renderIncidentDetailPage(incident, recentIncidents));
  });

  app.get('/privacy', (c) => c.html(renderPrivacyPage()));
  app.get('/terms', (c) => c.html(renderTermsPage()));
  app.get('/security', (c) => c.html(renderSecurityPage()));

  app.get('/api/admin/signups', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.json({ ok: false, error: 'Unauthorized' }, 401);
    }

    if (!c.env.DB) {
      return c.json({ ok: false, error: 'DB not configured' }, 503);
    }

    const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '100'), 1), 500);
    const format = c.req.query('format') ?? 'json';

    const result = await c.env.DB
      .prepare(
        `SELECT email, company, role, interests, source, utm_source, utm_medium, utm_campaign, referrer, landing_path, created_at
         FROM waitlist_signups
         ORDER BY datetime(created_at) DESC
         LIMIT ?1`
      )
      .bind(limit)
      .all<SignupRow>();

    const rows = result.results ?? [];

    if (format === 'csv') {
      return c.body(toCsv(rows), 200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="signups.csv"',
      });
    }

    return c.json({ ok: true, count: rows.length, rows });
  });

  app.get('/admin/signups', async (c) => {
    if (!isAdminAuthorized(c)) {
      return c.text('Unauthorized', 401);
    }

    if (!c.env.DB) {
      return c.text('DB not configured', 503);
    }

    const result = await c.env.DB
      .prepare(
        `SELECT email, company, role, interests, source, utm_source, utm_medium, utm_campaign, referrer, landing_path, created_at
         FROM waitlist_signups
         ORDER BY datetime(created_at) DESC
         LIMIT 200`
      )
      .all<SignupRow>();

    return c.html(renderAdminPage(result.results ?? []));
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

    if (result.inserted) {
      const notifyPromise = notifySignup(c.env, parsed.data);
      await runBackground(c, notifyPromise);
    }

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
