import type { EnvBindings } from './app';
import { ingestionHealth } from './ingestion-runtime';
import { readState, writeState } from './ingestion-storage';
import { sourceRequest } from './ingestion-network';
import { sha256Hex } from './ingestion';

export async function sendIngestionAlerts(env: EnvBindings, fetchFn: typeof fetch = fetch): Promise<void> {
  if (env.INGESTION_ALERTS_ENABLED !== 'true' || !env.DB) return;
  const health = await ingestionHealth(env);
  const issues = health.errors.filter((error) => !/local request quota reached|Source request budget exhausted|cooling down until/.test(error));
  if (!issues.length) return;
  const text = ['AI Security Radar: ingestion needs attention', ...issues,
    `Pending records: ${health.backlog}`, 'Review source status at https://aisecurityradar.com/admin/ops'].join('\n').slice(0, 3500);
  const fingerprint = await sha256Hex([...issues].sort().join('\n'));
  const deliveries: Array<{ channel: string; url: string; init: RequestInit }> = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) deliveries.push({ channel: 'telegram',
    url: `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, init: {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    } });
  if (env.RESEND_API_KEY && env.NOTIFY_EMAIL_TO) deliveries.push({ channel: 'email', url: 'https://api.resend.com/emails', init: {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Idempotency-Key': `ingestion-${fingerprint}-${Math.floor(Date.now() / 21600000)}` },
    body: JSON.stringify({ from: 'AI Security Radar <alerts@aisecurityradar.com>', to: [env.NOTIFY_EMAIL_TO],
      subject: 'AI Security Radar ingestion needs attention', text }),
  } });
  for (const delivery of deliveries) {
    const key = `alert:${delivery.channel}`;
    const previous = await readState<{ fingerprint: string; at: string }>(env.DB, key);
    if (previous?.fingerprint === fingerprint && Date.now() - Date.parse(previous.at) < 21600000) continue;
    try {
      await sourceRequest(fetchFn, delivery.url, 5000, delivery.init);
      await writeState(env.DB, key, { fingerprint, at: new Date().toISOString() });
    } catch { console.error(JSON.stringify({ event: 'ingestion_alert_failed', channel: delivery.channel })); }
  }
}
