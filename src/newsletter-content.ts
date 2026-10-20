export type DigestIncident = { title: string; slug: string; summary: string; severity: string;
  source: string; source_url: string; disclosed_at: string | null; remedy: string | null };
export type DigestContent = { start: string; end: string; total: number; incidents: DigestIncident[] };
export type MailPayload = { from: string; to: string[]; subject: string; text: string; html: string;
  headers: Record<string, string> };
export const NEWSLETTER_FROM = 'AI Security Radar <alerts@aisecurityradar.com>';

export function escapeEmail(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

export function plainEmail(value: string, limit = 220): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ').replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function safeLink(value: string): string {
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; }
  catch { return ''; }
}

function layout(title: string, preview: string, body: string, unsubscribe: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeEmail(title)}</title></head>
    <body style="margin:0;background:#f7f5ef;color:#1c1915;font-family:Arial,sans-serif;line-height:1.6">
    <div style="display:none;max-height:0;overflow:hidden">${escapeEmail(preview)}</div>
    <main style="max-width:600px;margin:0 auto;padding:28px 20px"><p style="color:#a71f1c;font-weight:bold">AI SECURITY RADAR</p>
    <h1 style="font-size:26px;line-height:1.25">${escapeEmail(title)}</h1>${body}
    <hr style="border:0;border-top:1px solid #ddd6c8;margin:24px 0"><p style="font-size:12px;color:#5e574e">You signed up at aisecurityradar.com. Contact: security@aisecurityradar.com.<br>
    <a href="${escapeEmail(unsubscribe)}">Unsubscribe</a> · <a href="https://aisecurityradar.com/privacy">Privacy</a></p></main></body></html>`;
}

function envelope(email: string, subject: string, text: string, html: string, unsubscribe: string): MailPayload {
  return { from: NEWSLETTER_FROM, to: [email], subject, text, html,
    headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

export function confirmationMail(email: string, confirm: string, unsubscribe: string): MailPayload {
  const subject = 'Confirm your AI Security Radar weekly digest';
  const text = `You signed up at aisecurityradar.com. Confirm your work email to receive one weekly digest of AI security advisories, source links, and response steps.\n\nWe send on Mondays at 13:00 UTC (20:00 Bangkok).\n\nConfirm your subscription: ${confirm}\n\nThis link expires in seven days. If you did not sign up, ignore this email.\nUnsubscribe: ${unsubscribe}`;
  const body = `<p>You signed up at aisecurityradar.com. Confirm your work email to receive one weekly digest of AI security advisories, source links, and practical response steps.</p>
    <p>Every Monday at 13:00 UTC (20:00 Bangkok).</p><p><a style="display:inline-block;padding:12px 20px;background:#135d7a;color:#fff;text-decoration:none" href="${escapeEmail(confirm)}">Confirm my subscription</a></p>
    <p style="font-size:13px">This link expires in seven days. If you did not sign up, ignore this email. You will receive no digest until you confirm.</p>`;
  return envelope(email, subject, text, layout(subject, 'One source-cited AI security roundup each Monday. Confirm to subscribe.', body, unsubscribe), unsubscribe);
}

function digestItem(item: DigestIncident, site: string) {
  const title = plainEmail(item.title, 180), summary = plainEmail(item.summary);
  const url = `${site}/incidents/${encodeURIComponent(item.slug)}`;
  const citation = safeLink(item.source_url);
  const disclosed = item.disclosed_at && Number.isFinite(Date.parse(item.disclosed_at)) ? item.disclosed_at.slice(0, 10) : 'not specified';
  const remedy = item.remedy ? plainEmail(item.remedy, 180) : '';
  const meta = `${item.severity.toUpperCase()} · Source disclosure: ${disclosed}`;
  return { text: `${title}\n${meta}\n${summary}${remedy ? `\nFirst step: ${remedy}` : ''}\nRead: ${url}${citation ? `\nSource: ${citation}` : ''}`,
    html: `<section style="margin:24px 0"><h2 style="font-size:19px;margin-bottom:6px"><a href="${escapeEmail(url)}">${escapeEmail(title)}</a></h2><p style="font-size:12px;color:#5e574e">${escapeEmail(meta)}</p>
      <p>${escapeEmail(summary)}</p>${remedy ? `<p><strong>First step:</strong> ${escapeEmail(remedy)}</p>` : ''}
      ${citation ? `<p><a href="${escapeEmail(citation)}">${escapeEmail(item.source.toUpperCase())} advisory</a></p>` : ''}</section>` };
}

export function digestMail(email: string, content: DigestContent, site: string, unsubscribe: string): MailPayload {
  const end = content.end.slice(0, 10);
  const subject = `AI security weekly: ${content.total} advisories · ${end}`;
  const intro = `${content.total} advisories were added to Radar from ${content.start.slice(0, 10)} to ${end}. Here are ${content.incidents.length} to review. Some additions may cover earlier disclosures; dates below identify the source disclosure.`;
  const items = content.incidents.map(item => digestItem(item, site));
  const text = `${intro}\n\n${items.map(item => item.text).join('\n\n')}\n\nBrowse the incident archive: ${site}/incidents\n\nUnsubscribe: ${unsubscribe}`;
  const body = `<p>${escapeEmail(intro)}</p>${items.map(item => item.html).join('')}<p><a style="display:inline-block;padding:12px 20px;background:#135d7a;color:#fff;text-decoration:none" href="${escapeEmail(site)}/incidents">Browse the incident archive</a></p>`;
  return envelope(email, subject, text, layout('Your weekly AI security digest', `${content.total} newly published advisories, source citations, and response steps.`, body, unsubscribe), unsubscribe);
}
