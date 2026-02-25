export type IncidentSource = {
  label: string;
  url: string;
};

export type IncidentEntry = {
  slug: string;
  title: string;
  incidentDate: string;
  publishedDate: string;
  summary: string;
  impact: string;
  remedy: string[];
  sources: IncidentSource[];
};

export type LandingSampleAlert = {
  title: string;
  severity: string;
  summary: string;
  remedy: string;
  sourceLabel: string;
  sourceUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function trimToSentence(value: string, max: number): string {
  const normalized = value.trim();
  if (normalized.length <= max) {
    return normalized;
  }
  const clipped = normalized.slice(0, max).trim();
  const punctuation = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'));
  if (punctuation >= Math.floor(max * 0.45)) {
    return clipped.slice(0, punctuation + 1).trim();
  }
  const lastSpace = clipped.lastIndexOf(' ');
  if (lastSpace >= Math.floor(max * 0.6)) {
    return `${clipped.slice(0, lastSpace).trim()}...`;
  }
  return `${clipped}...`;
}

function stripDangerousBlocks(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<object[\s\S]*?<\/object>/gi, ' ')
    .replace(/<embed[\s\S]*?>/gi, ' ');
}

function stripHtmlTags(value: string): string {
  return stripDangerousBlocks(value).replace(/<[^>]*>/g, ' ');
}

function toSafeText(value: string): string {
  return escapeHtml(normalizeWhitespace(stripHtmlTags(value)));
}

function toSafeUrl(value: string, base?: string): string {
  try {
    const url = base ? new URL(value, base) : new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
    return '#';
  } catch {
    return '#';
  }
}

function extractImageUrls(raw: string, base?: string): string[] {
  const candidates = new Set<string>();
  const imgTagRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  const markdownRegex = /!\[[^\]]*]\(([^)]+)\)/g;

  for (const match of raw.matchAll(imgTagRegex)) {
    const candidate = match[1]?.trim();
    if (candidate) {
      candidates.add(candidate);
    }
  }
  for (const match of raw.matchAll(markdownRegex)) {
    const candidate = match[1]?.trim();
    if (candidate) {
      candidates.add(candidate);
    }
  }

  const resolved: string[] = [];
  for (const candidate of candidates) {
    const safe = toSafeUrl(candidate, base);
    if (safe !== '#') {
      resolved.push(safe);
    }
  }
  return resolved.slice(0, 6);
}

type SeoMeta = {
  title: string;
  description: string;
  canonicalPath: string;
  siteUrl?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
};

function normalizeSiteUrl(siteUrl?: string): string {
  const fallback = 'https://aisecurityradar.com';
  if (!siteUrl) {
    return fallback;
  }
  return siteUrl.replace(/\/+$/, '');
}

function absoluteUrl(siteUrl: string | undefined, path: string): string {
  const base = normalizeSiteUrl(siteUrl);
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderSeoMeta(input: SeoMeta): string {
  const url = absoluteUrl(input.siteUrl, input.canonicalPath);
  const robots = input.noindex ? 'noindex, nofollow' : 'index, follow';
  const type = input.type ?? 'website';
  const title = escapeAttr(input.title);
  const description = escapeAttr(input.description);
  const canonical = escapeAttr(url);

  return `
  <meta name="description" content="${description}" />
  <meta name="robots" content="${robots}" />
  <link rel="canonical" href="${canonical}" />
  <meta property="og:site_name" content="AI Security Radar" />
  <meta property="og:type" content="${type}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonical}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <link rel="sitemap" type="application/xml" href="${escapeAttr(absoluteUrl(input.siteUrl, '/sitemap.xml'))}" />`;
}

function renderSiteHeader(appName = 'AI Security Radar'): string {
  return `<header class="topbar">
      <a class="brand-link" href="/" aria-label="${escapeHtml(appName)} homepage">
        <div class="brand"><span class="mark">ASR</span> ${escapeHtml(appName)}</div>
      </a>
      <div class="nav">
        <a class="link-btn" href="/incidents">Recent Incidents</a>
        <a class="link-btn cta-nav" id="nav-get-notified" data-cta="nav_get_notified" href="/#waitlist-form">Get Notified</a>
      </div>
    </header>`;
}

function renderSiteFooter(): string {
  return `<footer class="site-footer">
      <span>AI Security Radar</span>
      <span>Contact: <a href="mailto:security@aisecurityradar.com">security@aisecurityradar.com</a></span>
      <span>&copy; 2026 AI Security Radar</span>
      <span><a href="/privacy">Privacy</a> | <a href="/terms">Terms</a> | <a href="/security">Security</a></span>
    </footer>`;
}

export function renderLandingPage(
  appName: string,
  gaMeasurementId?: string,
  sampleAlert?: LandingSampleAlert,
  siteUrl?: string
): string {
  const gaSnippet = gaMeasurementId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaMeasurementId}');
  </script>`
    : '';
  const seoSnippet = renderSeoMeta({
    title: appName,
    description:
      'AI Security Radar monitors trusted advisories and incident sources, then delivers actionable remediation alerts for security and compliance teams.',
    canonicalPath: '/',
    siteUrl,
    type: 'website',
  });
  const sampleAlertCard = sampleAlert
    ? `<div class="alert-card">
          <div class="severity">${toSafeText(sampleAlert.severity)}</div>
          <div><strong>${toSafeText(sampleAlert.title)}</strong></div>
          <div class="sub">${toSafeText(sampleAlert.summary)}</div>
          <div class="sub">${toSafeText(sampleAlert.remedy)}</div>
          <div class="links">
            <a href="${toSafeUrl(sampleAlert.sourceUrl)}" target="_blank" rel="noopener noreferrer">${toSafeText(sampleAlert.sourceLabel)}</a>
          </div>
        </div>`
    : `<div class="alert-card">
          <div class="severity">No live sample yet</div>
          <div><strong>No published incidents yet.</strong></div>
          <div class="sub">A verified sample alert will appear here after the first published incident.</div>
        </div>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(appName)}</title>
  ${seoSnippet}
  ${gaSnippet}
  <style>
    :root {
      --bg: #f5f2ec;
      --ink: #191612;
      --muted: #5e574e;
      --danger: #a71f1c;
      --accent: #135d7a;
      --card: #fffdf8;
      --line: #d9d2c7;
      --good: #1f6d35;
    }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background: radial-gradient(circle at top right, #ead9c8, transparent 36%), var(--bg);
      line-height: 1.42;
    }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 20px 16px 52px; }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      gap: 10px;
    }
    .brand-link { color: inherit; text-decoration: none; }
    .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .2px; }
    .nav { display: flex; align-items: center; gap: 8px; }
    .mark {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--danger);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
    }
    .link-btn {
      border: 1px solid var(--line);
      padding: 8px 10px;
      background: #fff;
      color: var(--ink);
      text-decoration: none;
      font-size: 14px;
    }
    .cta-nav {
      background: #135d7a;
      border-color: #135d7a;
      color: #fff;
      font-weight: 700;
    }
    .hero {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 22px;
      margin-bottom: 14px;
    }
    .hero-cta { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
    .btn-cta {
      display: inline-block;
      background: #135d7a;
      color: #fff;
      border: 1px solid #135d7a;
      padding: 10px 14px;
      text-decoration: none;
      font-size: 15px;
      font-weight: 700;
    }
    .btn-ghost {
      display: inline-block;
      background: #fff;
      color: var(--ink);
      border: 1px solid var(--line);
      padding: 10px 14px;
      text-decoration: none;
      font-size: 15px;
    }
    h1 { margin: 0 0 12px; font-size: 37px; line-height: 1.06; }
    .risk { color: var(--danger); font-weight: 700; }
    p { margin: 0 0 12px; font-size: 18px; }
    .sub { color: var(--muted); font-size: 16px; overflow-wrap: anywhere; word-break: break-word; }
    .proof-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 14px;
    }
    .proof {
      border: 1px solid var(--line);
      background: #fff;
      padding: 10px;
      font-size: 13px;
      text-align: center;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr .8fr;
      gap: 14px;
      margin-bottom: 14px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 16px;
    }
    h2 { margin: 0 0 10px; font-size: 24px; }
    h3 { margin: 0 0 8px; font-size: 18px; }
    .list { margin: 0; padding-left: 18px; }
    .list li { margin-bottom: 8px; }
    .steps { margin-top: 8px; }
    .alert-card {
      border: 1px solid #cdb8b4;
      background: #fff;
      padding: 12px;
      margin-top: 8px;
      font-size: 15px;
    }
    .severity {
      display: inline-block;
      font-size: 12px;
      padding: 2px 6px;
      background: #f9d9d8;
      color: #7a1614;
      margin-bottom: 8px;
      border: 1px solid #e8b8b7;
    }
    label { display: block; font-size: 14px; margin-bottom: 6px; }
    input[type="email"], input[type="text"], textarea {
      width: 100%;
      border: 1px solid #9e978c;
      border-radius: 3px;
      padding: 10px;
      font-size: 15px;
      margin-bottom: 12px;
      box-sizing: border-box;
      font-family: inherit;
      background: #fff;
    }
    .actions { display: grid; gap: 8px; }
    button {
      border: 0;
      background: var(--danger);
      color: #fff;
      padding: 12px 14px;
      font-size: 16px;
      cursor: pointer;
      width: 100%;
    }
    .secondary { background: #223642; }
    .trust-strip {
      margin-top: 10px;
      padding: 10px;
      border: 1px dashed #b5aea3;
      font-size: 13px;
      color: var(--muted);
    }
    .links { margin-top: 6px; display: flex; gap: 10px; }
    .links a { color: var(--accent); font-size: 13px; }
    .small { font-size: 13px; color: #4d483f; margin-top: 8px; }
    .ok { color: var(--good); }
    .err { color: var(--danger); }
    .site-footer {
      border-top: 1px solid var(--line);
      padding-top: 12px;
      font-size: 13px;
      color: var(--muted);
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    @media (max-width: 900px) {
      .proof-row { grid-template-columns: 1fr 1fr; }
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 31px; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    ${renderSiteHeader(appName)}

    <section class="hero">
      <h1>When AI security incidents break, <span class="risk">minutes decide the outcome.</span></h1>
      <p>Get verified AI threat alerts with immediate remediation actions so your team can contain risk before it turns into a breach or compliance event.</p>
      <p class="sub">Built for security and risk teams that need faster awareness, better evidence, and clearer response ownership.</p>
      <div class="hero-cta">
        <a class="btn-cta" id="hero-get-notified" data-cta="hero_get_notified" href="#waitlist-form">Get Notified</a>
        <a class="btn-ghost" href="/incidents">See Recent Incidents</a>
      </div>
    </section>

    <section class="proof-row" aria-label="Data sources">
      <div class="proof">Monitors CISA KEV and NVD</div>
      <div class="proof">Tracks GitHub Advisories and CERT feeds</div>
      <div class="proof">Source-cited recommendations</div>
      <div class="proof">Email + Telegram delivery</div>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>How It Works</h2>
        <ol class="list steps">
          <li>Collects AI-security incident signals from curated high-noise channels and advisories.</li>
          <li>Triages and scores incident relevance and urgency for security teams.</li>
          <li>Sends concise alert briefs with impact, remedy checklist, and citations.</li>
        </ol>

        <h3>Sample Alert</h3>
        ${sampleAlertCard}
      </article>

      <form class="panel" id="waitlist-form" method="post" action="/api/waitlist">
        <h2>Request Access</h2>
        <label for="email">Work Email</label>
        <input id="email" name="email" type="email" required />

        <div class="actions">
          <button type="submit">Get Notified</button>
        </div>

        <input type="hidden" name="source" value="landing-page" />
        <input type="hidden" name="utmSource" id="utmSource" value="" />
        <input type="hidden" name="utmMedium" id="utmMedium" value="" />
        <input type="hidden" name="utmCampaign" id="utmCampaign" value="" />
        <input type="hidden" name="referrer" id="referrer" value="" />
        <input type="hidden" name="landingPath" id="landingPath" value="" />

        <div class="trust-strip">
          We only use your details for access and product updates. No spam. No resale.
          <div class="links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security">Security</a></div>
        </div>
        <p id="status" class="small" aria-live="polite"></p>
      </form>
    </section>

    ${renderSiteFooter()}
  </main>

  <script>
    const form = document.getElementById('waitlist-form');
    const status = document.getElementById('status');
    const params = new URLSearchParams(window.location.search);
    const emailInput = document.getElementById('email');

    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };
    const track = (eventName, params) => {
      if (typeof window.gtag === 'function') {
        window.gtag('event', eventName, params || {});
      }
    };

    const utmSource = params.get('utm_source') || '';
    const utmMedium = params.get('utm_medium') || '';
    const utmCampaign = params.get('utm_campaign') || '';
    setField('utmSource', utmSource);
    setField('utmMedium', utmMedium);
    setField('utmCampaign', utmCampaign);
    setField('referrer', document.referrer || 'direct');
    setField('landingPath', window.location.pathname + window.location.search);

    const bindCtaTracking = (id) => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('click', () => {
        track('cta_click', { cta: node.dataset.cta || id, location: id.includes('hero') ? 'hero' : 'nav' });
      });
    };
    bindCtaTracking('nav-get-notified');
    bindCtaTracking('hero-get-notified');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = 'Submitting...';
      status.className = 'small';

      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        status.textContent = 'Please enter a valid work email.';
        status.className = 'small err';
        track('waitlist_submit_error', { reason: 'invalid_email' });
        return;
      }

      const formData = new FormData(form);

      const response = await fetch('/api/waitlist', {
        method: 'POST',
        body: formData,
      });

      const body = await response.json();
      if (!response.ok) {
        status.textContent = 'Please check your input and try again.';
        status.className = 'small err';
        track('waitlist_submit_error', { reason: 'api_error' });
        return;
      }

      if (body.status === 'already_joined') {
        status.textContent = 'You are already on the waitlist. We will contact you soon.';
        track('waitlist_submit_duplicate', { source: formData.get('source') || 'landing-page' });
      } else {
        status.textContent = 'Request received. We will send access details shortly.';
        track('waitlist_submit_success', {
          source: formData.get('source') || 'landing-page',
          utm_source: formData.get('utmSource') || '',
          utm_medium: formData.get('utmMedium') || '',
          utm_campaign: formData.get('utmCampaign') || '',
        });
        form.reset();
      }
      status.className = 'small ok';
    });
  </script>
</body>
</html>`;
}

export function renderIncidentsPage(incidents: IncidentEntry[], siteUrl?: string): string {
  const cards = incidents
    .map((item) => {
      const safeTitle = toSafeText(item.title);
      const safeSummary = toSafeText(item.summary);
      const safeIncidentDate = toSafeText(item.incidentDate);
      const safePublishedDate = toSafeText(item.publishedDate);
      const safeSlug = encodeURIComponent(item.slug);
      return `<article style="border:1px solid #ddd6c8;background:#fffdf9;padding:16px;margin-bottom:12px;">
        <h2 style="margin:0 0 8px;font-size:24px;"><a href="/incidents/${safeSlug}" style="color:#1a1815;text-decoration:none;">${safeTitle}</a></h2>
        <p style="margin:0 0 8px;font-size:14px;color:#5f584f;">Incident date: ${safeIncidentDate} | Published: ${safePublishedDate}</p>
        <p style="margin:0 0 8px;">${safeSummary}</p>
        <p style="margin:0;"><a href="/incidents/${safeSlug}" style="color:#135d7a;">Read details</a></p>
      </article>`;
    })
    .join('');
  const seoSnippet = renderSeoMeta({
    title: 'Recent AI Security Incidents | AI Security Radar',
    description: 'Chronological AI security incidents with impact summaries, source citations, and remediation guidance.',
    canonicalPath: '/incidents',
    siteUrl,
    type: 'website',
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recent AI Security Incidents</title>
  ${seoSnippet}
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background:#f7f5ef; color:#1c1915; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 20px 16px 48px; }
    .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; gap: 10px; }
    .brand-link { color: inherit; text-decoration: none; }
    .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px; }
    .mark { width:28px; height:28px; border-radius:50%; background:#a71f1c; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .nav { display:flex; align-items:center; gap:8px; }
    .link-btn { border:1px solid #d9d2c7; padding:8px 10px; background:#fff; color:#1c1915; text-decoration:none; font-size:14px; }
    .cta-nav { background:#135d7a; border-color:#135d7a; color:#fff; font-weight:700; }
    h1 { margin-top: 0; }
    .back { margin-bottom: 14px; display:inline-block; color:#135d7a; }
    .site-footer {
      border-top: 1px solid #d9d2c7;
      margin-top: 18px;
      padding-top: 12px;
      font-size: 13px;
      color: #5e574e;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .site-footer a { color: #135d7a; }
  </style>
</head>
<body>
  <main class="wrap">
    ${renderSiteHeader()}
    <a class="back" href="/">Back to homepage</a>
    <h1>Recent AI Security Incidents</h1>
    <p>Curated incidents with impact and remediation notes.</p>
    ${cards}
    ${renderSiteFooter()}
  </main>
</body>
</html>`;
}

export function renderIncidentDetailPage(
  incident: IncidentEntry,
  allIncidents: IncidentEntry[],
  siteUrl?: string
): string {
  const safeTitle = toSafeText(incident.title);
  const safeIncidentDate = toSafeText(incident.incidentDate);
  const safePublishedDate = toSafeText(incident.publishedDate);
  const safeSummary = toSafeText(incident.summary);
  const safeImpact = toSafeText(incident.impact);
  const baseSourceUrl = incident.sources[0]?.url;
  const imageUrls = extractImageUrls(`${incident.summary}\n${incident.impact}`, baseSourceUrl);
  const imageCards = imageUrls
    .map(
      (url, index) => `<img src="${escapeHtml(url)}" alt="${safeTitle} image ${index + 1}" loading="lazy" style="max-width:100%;height:auto;border:1px solid #ddd6c8;background:#fff;margin-top:8px;" />`
    )
    .join('');
  const remedies = incident.remedy.map((step) => `<li>${toSafeText(step)}</li>`).join('');
  const sourceLinks = incident.sources
    .map((source) => {
      const href = toSafeUrl(source.url, baseSourceUrl);
      return `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${toSafeText(source.label)}</a></li>`;
    })
    .join('');
  const otherItems = allIncidents
    .filter((item) => item.slug !== incident.slug)
    .slice(0, 3)
    .map((item) => `<li><a href="/incidents/${encodeURIComponent(item.slug)}">${toSafeText(item.title)}</a></li>`)
    .join('');
  const seoDescription = trimToSentence(
    normalizeWhitespace(stripHtmlTags(incident.summary)) || 'AI security incident summary and response guidance.',
    260
  );
  const seoSnippet = renderSeoMeta({
    title: `${incident.title} | AI Security Radar`,
    description: seoDescription,
    canonicalPath: `/incidents/${incident.slug}`,
    siteUrl,
    type: 'article',
  });
  const incidentUrl = absoluteUrl(siteUrl, `/incidents/${incident.slug}`);
  const shareText = encodeURIComponent(`AI security incident: ${incident.title}`);
  const shareUrl = encodeURIComponent(incidentUrl);
  const shareX = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;
  const shareLinkedIn = `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  ${seoSnippet}
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background:#f7f5ef; color:#1c1915; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 20px 16px 48px; }
    .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; gap: 10px; }
    .brand-link { color: inherit; text-decoration: none; }
    .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px; }
    .mark { width:28px; height:28px; border-radius:50%; background:#a71f1c; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .nav { display:flex; align-items:center; gap:8px; }
    .link-btn { border:1px solid #d9d2c7; padding:8px 10px; background:#fff; color:#1c1915; text-decoration:none; font-size:14px; }
    .cta-nav { background:#135d7a; border-color:#135d7a; color:#fff; font-weight:700; }
    article { border:1px solid #ddd6c8;background:#fffdf9;padding:18px; }
    h1 { margin-top: 0; }
    .meta { color:#5f584f; font-size:14px; margin-bottom: 10px; }
    p, li, .meta { overflow-wrap: anywhere; word-break: break-word; }
    a { color:#135d7a; }
    .incident-cta {
      margin-top: 16px;
      border: 1px solid #d9d2c7;
      background: #f1efe9;
      padding: 14px;
    }
    .share-cta {
      margin-top: 16px;
      border: 1px solid #d9d2c7;
      background: #fff;
      padding: 14px;
    }
    .share-buttons { display:flex; gap:10px; flex-wrap:wrap; }
    .share-btn {
      display:inline-block;
      border:1px solid #135d7a;
      color:#135d7a;
      text-decoration:none;
      padding:8px 12px;
      font-weight:700;
      background:#fff;
    }
    .incident-cta-title { margin: 0 0 8px; font-size: 20px; }
    .incident-cta-text { margin: 0 0 10px; font-size: 16px; }
    .incident-cta-btn {
      display: inline-block;
      background: #135d7a;
      border: 1px solid #135d7a;
      color: #fff;
      text-decoration: none;
      padding: 10px 14px;
      font-weight: 700;
    }
    .site-footer {
      border-top: 1px solid #d9d2c7;
      margin-top: 18px;
      padding-top: 12px;
      font-size: 13px;
      color: #5e574e;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .site-footer a { color: #135d7a; }
  </style>
</head>
<body>
  <main class="wrap">
    ${renderSiteHeader()}
    <p><a href="/incidents">Back to incidents</a></p>
    <article>
      <h1>${safeTitle}</h1>
      <p class="meta">Incident date: ${safeIncidentDate} | Published: ${safePublishedDate}</p>
      <p>${safeSummary}</p>
      ${imageCards}
      <h2>Impact</h2>
      <p>${safeImpact}</p>
      <h2>Recommended Response</h2>
      <ul>${remedies}</ul>
      <h2>Sources</h2>
      <ul>${sourceLinks}</ul>
      <section class="share-cta">
        <h3 style="margin:0 0 8px;">Share this incident</h3>
        <div class="share-buttons">
          <a class="share-btn" href="${escapeHtml(shareLinkedIn)}" target="_blank" rel="noopener noreferrer">Share on LinkedIn</a>
          <a class="share-btn" href="${escapeHtml(shareX)}" target="_blank" rel="noopener noreferrer">Share on X</a>
        </div>
      </section>
      <section class="incident-cta">
        <h3 class="incident-cta-title">Want alerts like this in real time?</h3>
        <p class="incident-cta-text">Get notified with incident context, likely impact, and response guidance.</p>
        <a class="incident-cta-btn" href="/#waitlist-form">Get Notified</a>
      </section>
    </article>
    <section style="margin-top:14px;">
      <h3>More incidents</h3>
      <ul>${otherItems}</ul>
    </section>
    ${renderSiteFooter()}
  </main>
</body>
</html>`;
}

function renderPolicyShell(title: string, body: string, canonicalPath: string, siteUrl?: string): string {
  const seoSnippet = renderSeoMeta({
    title: `${title} | AI Security Radar`,
    description: `${title} for AI Security Radar.`,
    canonicalPath,
    siteUrl,
    type: 'website',
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - AI Security Radar</title>
  ${seoSnippet}
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #f7f5ef; color: #1c1915; }
    .wrap { max-width: 960px; margin: 0 auto; padding: 20px 16px 48px; }
    .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; gap: 10px; }
    .brand-link { color: inherit; text-decoration: none; }
    .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px; }
    .mark { width:28px; height:28px; border-radius:50%; background:#a71f1c; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .nav { display:flex; align-items:center; gap:8px; }
    .link-btn { border:1px solid #d9d2c7; padding:8px 10px; background:#fff; color:#1c1915; text-decoration:none; font-size:14px; }
    .cta-nav { background:#135d7a; border-color:#135d7a; color:#fff; font-weight:700; }
    article { background: #fffdf9; border: 1px solid #ddd6c8; padding: 20px; }
    h1 { margin-top: 0; }
    h2 { margin-top: 18px; font-size: 20px; }
    p, li { font-size: 16px; line-height: 1.45; }
    a { color: #135d7a; }
    .site-footer {
      border-top: 1px solid #d9d2c7;
      margin-top: 18px;
      padding-top: 12px;
      font-size: 13px;
      color: #5e574e;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .site-footer a { color: #135d7a; }
  </style>
</head>
<body>
  <main class="wrap">
    ${renderSiteHeader()}
    <article>
      <h1>${title}</h1>
      ${body}
      <p><a href="/">Back to homepage</a></p>
    </article>
    ${renderSiteFooter()}
  </main>
</body>
</html>`;
}

export function renderPrivacyPage(siteUrl?: string): string {
  return renderPolicyShell(
    'Privacy Policy',
    `
    <p>Last updated: February 14, 2026</p>
    <p>We collect contact and profile information that you submit in the waitlist form, along with attribution metadata (for example UTM parameters) for demand analysis.</p>
    <h2>What We Collect</h2>
    <ul>
      <li>Work email, company, role, and optional interests you provide.</li>
      <li>Traffic attribution metadata such as source, campaign, and referrer.</li>
    </ul>
    <h2>How We Use Data</h2>
    <ul>
      <li>To contact you about access, onboarding, and product updates.</li>
      <li>To measure campaign performance and improve product positioning.</li>
    </ul>
    <h2>Data Sharing</h2>
    <p>We do not sell your personal data. We may use vetted subprocessors for hosting, analytics, and notification delivery.</p>
    <h2>Your Rights</h2>
    <p>You can request access, correction, or deletion by emailing security@aisecurityradar.com.</p>
    `,
    '/privacy',
    siteUrl
  );
}

export function renderTermsPage(siteUrl?: string): string {
  return renderPolicyShell(
    'Terms of Use',
    `
    <p>Last updated: February 14, 2026</p>
    <p>By using this site, you agree to provide accurate information and not misuse the service.</p>
    <h2>Service Scope</h2>
    <p>Current service access is pre-release and provided on an as-available basis.</p>
    <h2>No Warranty</h2>
    <p>Content and alerts are informational and do not constitute legal or regulatory advice.</p>
    <h2>Liability</h2>
    <p>To the maximum extent permitted by law, liability is limited to direct damages only.</p>
    <h2>Contact</h2>
    <p>Questions about terms can be sent to security@aisecurityradar.com.</p>
    `,
    '/terms',
    siteUrl
  );
}

export function renderSecurityPage(siteUrl?: string): string {
  return renderPolicyShell(
    'Security',
    `
    <p>Last updated: February 14, 2026</p>
    <p>We apply access controls, environment-isolated infrastructure, and least-privilege handling for operational data.</p>
    <h2>Security Practices</h2>
    <ul>
      <li>Transport security via HTTPS.</li>
      <li>Credential and API key management using environment secrets.</li>
      <li>Restricted administrative endpoints protected by token-based authentication.</li>
    </ul>
    <h2>Incident Reporting</h2>
    <p>If you identify a security issue, contact security@aisecurityradar.com with details and reproduction steps.</p>
    `,
    '/security',
    siteUrl
  );
}

export function renderAdminOpsPage(siteUrl?: string): string {
  const seoSnippet = renderSeoMeta({
    title: 'Admin Operations | AI Security Radar',
    description: 'Administrative operations for ingestion and incident publishing.',
    canonicalPath: '/admin/ops',
    siteUrl,
    type: 'website',
    noindex: true,
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Operations - AI Security Radar</title>
  ${seoSnippet}
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #f7f5ef; color: #1c1915; }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 20px 16px 48px; }
    .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; gap: 10px; }
    .brand-link { color: inherit; text-decoration: none; }
    .brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:.2px; }
    .mark { width:28px; height:28px; border-radius:50%; background:#a71f1c; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; }
    .nav { display:flex; align-items:center; gap:8px; }
    .link-btn { border:1px solid #d9d2c7; padding:8px 10px; background:#fff; color:#1c1915; text-decoration:none; font-size:14px; }
    .cta-nav { background:#135d7a; border-color:#135d7a; color:#fff; font-weight:700; }
    .panel { background: #fffdf9; border: 1px solid #ddd6c8; padding: 16px; margin-bottom: 12px; }
    h1 { margin: 0 0 10px; }
    h2 { margin: 0 0 10px; }
    label { font-size: 14px; display: block; margin-bottom: 6px; }
    input[type="password"], input[type="number"] {
      width: 100%;
      max-width: 420px;
      padding: 10px;
      border: 1px solid #9e978c;
      font-size: 14px;
      box-sizing: border-box;
      margin-bottom: 10px;
      background: #fff;
      font-family: inherit;
    }
    .btn {
      border: 1px solid #1d3644;
      background: #1d3644;
      color: #fff;
      padding: 8px 12px;
      font-size: 14px;
      cursor: pointer;
      margin-right: 8px;
      margin-bottom: 8px;
    }
    .btn.secondary { background: #fff; color: #1d3644; }
    .btn.warn { background: #6b4f10; border-color: #6b4f10; color: #fff; }
    .btn.ok { background: #1f6d35; border-color: #1f6d35; color: #fff; }
    .muted { color: #5f584f; font-size: 13px; }
    .status-ok { color: #1f6d35; }
    .status-err { color: #a71f1c; }
    .draft-card, .ingestion-card { border: 1px solid #d9d2c7; background: #fff; padding: 12px; margin-bottom: 10px; }
    .meta { font-size: 13px; color: #5f584f; margin-bottom: 8px; }
    pre {
      white-space: pre-wrap;
      background: #f5f2ec;
      border: 1px solid #ddd6c8;
      padding: 10px;
      font-size: 12px;
      overflow-x: auto;
    }
    .grid { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; }
    @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }
    .site-footer {
      border-top: 1px solid #d9d2c7;
      margin-top: 18px;
      padding-top: 12px;
      font-size: 13px;
      color: #5e574e;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
    }
    .site-footer a { color: #135d7a; }
  </style>
</head>
<body>
  <main class="wrap">
    ${renderSiteHeader()}
    <section class="panel">
      <h1>Admin Operations</h1>
      <p class="muted">Use your admin bearer token in this page session only. It is never sent in URL parameters.</p>
      <label for="token">Admin Token</label>
      <input id="token" type="password" autocomplete="off" />
      <label for="limit">Record Limit</label>
      <input id="limit" type="number" min="1" max="200" value="20" />
      <div>
        <button class="btn" id="run-btn" type="button">Run Ingestion Now</button>
        <button class="btn secondary" id="load-ingestions-btn" type="button">Load Ingestions</button>
        <button class="btn secondary" id="normalize-summaries-btn" type="button">Normalize Long Summaries</button>
        <button class="btn secondary" id="clear-incidents-btn" type="button">Clear Incidents</button>
        <button class="btn warn" id="reset-ingestion-btn" type="button">Reset Ingestion DB</button>
      </div>
      <p id="status" class="muted" aria-live="polite"></p>
    </section>

    <section class="panel">
      <h2>Ingestions (sorted by incident date)</h2>
      <p class="muted">Drafts are created manually from ingestion records.</p>
      <div id="ingestions"></div>
    </section>
    ${renderSiteFooter()}
  </main>
  <script>
    const statusEl = document.getElementById('status');
    const ingestionsEl = document.getElementById('ingestions');
    const tokenEl = document.getElementById('token');
    const limitEl = document.getElementById('limit');
    const runBtn = document.getElementById('run-btn');
    const loadIngestionsBtn = document.getElementById('load-ingestions-btn');
    const normalizeSummariesBtn = document.getElementById('normalize-summaries-btn');
    const clearIncidentsBtn = document.getElementById('clear-incidents-btn');
    const resetIngestionBtn = document.getElementById('reset-ingestion-btn');

    function setStatus(message, kind) {
      statusEl.textContent = message;
      statusEl.className = kind ? 'muted status-' + kind : 'muted';
    }

    function escapeHtml(value) {
      return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function safeUrl(value) {
      try {
        const parsed = new URL(String(value || ''), window.location.origin);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.toString();
        }
      } catch (_) {}
      return '#';
    }

    function previewText(value, maxChars) {
      const raw = String(value || '').replace(/\s+/g, ' ').trim();
      if (raw.length <= maxChars) {
        return raw;
      }
      return raw.slice(0, maxChars).trimEnd() + '...';
    }

    function authHeaders() {
      const token = tokenEl.value.trim();
      if (!token) {
        throw new Error('Admin token is required.');
      }
      return { Authorization: 'Bearer ' + token };
    }

    function getLimit() {
      return Math.max(1, Math.min(200, Number(limitEl.value || 20)));
    }

    async function api(path, options) {
      const res = await fetch(path, {
        ...options,
        headers: {
          ...(options && options.headers ? options.headers : {}),
          ...authHeaders(),
        },
      });

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        const snippet = (text || '').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 180);
        throw new Error('HTTP ' + res.status + ': non-JSON response. ' + (snippet || 'No body'));
      }

      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error('HTTP ' + res.status + ': ' + (body.error || 'Request failed'));
      }
      return body;
    }

    function ingestionCard(row) {
      const rawSummary = String(row.summary || '');
      const shortSummary = previewText(rawSummary, 360);
      const hasLongSummary = rawSummary.length > shortSummary.length;
      const meta = [
        'ID ' + row.id,
        row.source || 'unknown',
        row.external_id || '',
        (row.severity || 'n/a').toUpperCase(),
        row.published_at || row.created_at || 'unknown',
      ].map(escapeHtml).join(' | ');
      const sourceLink = row.url ? '<a href="' + safeUrl(row.url) + '" target="_blank" rel="noopener noreferrer">Source</a>' : '';
      const draftId = Number(row.draft_id || 0);
      const draftStatus = String(row.draft_status || '');
      const linkedinText = String(row.draft_linkedin_text || '').trim();
      const xText = String(row.draft_x_text || '').trim();
      const createBtn = draftId > 0
        ? ''
        : '<button class="btn secondary" data-action="create-draft" data-event-id="' + row.id + '">Create Draft</button>';
      const approveBtn = draftId > 0 && draftStatus === 'draft'
        ? '<button class="btn warn" data-action="approve" data-draft-id="' + draftId + '">Approve Draft</button>'
        : '';
      const publishBtn = draftId > 0 && (draftStatus === 'approved' || draftStatus === 'published')
        ? '<button class="btn ok" data-action="publish" data-draft-id="' + draftId + '">' + (draftStatus === 'published' ? 'Published' : 'Publish to Incidents') + '</button>'
        : '';
      const removeIncidentBtn = draftId > 0 && draftStatus === 'published'
        ? '<button class="btn secondary" data-action="remove-incident" data-draft-id="' + draftId + '">Remove from Incidents</button>'
        : '';
      const draftState = draftId > 0
        ? 'Draft: <strong>' + escapeHtml(draftStatus.toUpperCase()) + '</strong>' +
          (row.draft_slug ? ' | <a href="/incidents/' + encodeURIComponent(String(row.draft_slug)) + '" target="_blank" rel="noopener noreferrer">Published page</a>' : '')
        : 'Draft: <strong>NONE</strong>';
      const socialPreviews = draftId > 0
        ? '<details style="margin-top:8px;"><summary style="cursor:pointer;">Show draft social copy</summary>' +
            '<strong>LinkedIn</strong><pre>' + escapeHtml(linkedinText || '(empty)') + '</pre>' +
            '<strong>X</strong><pre>' + escapeHtml(xText || '(empty)') + '</pre>' +
          '</details>'
        : '';
      const draftHint = draftId > 0
        ? '<p class="meta">A draft already exists for this ingestion, so <strong>Create Draft</strong> is hidden.</p>'
        : '';

      return '<article class="ingestion-card">' +
        '<h3 style="margin:0 0 6px;">' + escapeHtml(row.title || 'Untitled ingestion') + '</h3>' +
        '<p class="meta">' + meta + '</p>' +
        '<p class="meta">' + draftState + '</p>' +
        draftHint +
        '<p style="margin:0 0 8px;">' + sourceLink + '</p>' +
        '<p style="margin:0;">' + escapeHtml(shortSummary) + '</p>' +
        (hasLongSummary
          ? '<details style="margin-top:8px;"><summary style="cursor:pointer;">Show full content</summary><pre>' + escapeHtml(rawSummary) + '</pre></details>'
          : '') +
        socialPreviews +
        '<div style="margin-top:8px;">' + createBtn + approveBtn + publishBtn + removeIncidentBtn + '</div>' +
      '</article>';
    }

    async function loadIngestions() {
      const body = await api('/api/admin/ingestions?limit=' + getLimit());
      const rows = body.rows || [];
      ingestionsEl.innerHTML = rows.length > 0
        ? rows.map(ingestionCard).join('')
        : '<p class="muted">No ingestions yet.</p>';
      return rows.length;
    }

    runBtn.addEventListener('click', async () => {
      try {
        setStatus('Running ingestion...', '');
        const body = await api('/api/admin/ingestion/run', { method: 'POST' });
        const r = body.result || {};
        await loadIngestions();
        setStatus(
          'Done. fetched=' + (r.fetched || 0) + ', relevant=' + (r.relevant || 0) + ', inserted=' + (r.inserted || 0) + ', deduped=' + (r.deduped || 0) + ', drafts=' + (r.draftsCreated || 0) + ', llm_dedupe=' + (r.llmDedupeCalls || 0) + ', llm_enrich=' + (r.llmEnrichCalls || 0),
          'ok'
        );
      } catch (error) {
        setStatus(error.message || 'Request failed', 'err');
      }
    });

    loadIngestionsBtn.addEventListener('click', async () => {
      try {
        setStatus('Loading ingestions...', '');
        const count = await loadIngestions();
        setStatus('Loaded ' + count + ' ingestions.', 'ok');
      } catch (error) {
        ingestionsEl.innerHTML = '';
        setStatus(error.message || 'Request failed', 'err');
      }
    });

    normalizeSummariesBtn.addEventListener('click', async () => {
      try {
        const confirmed = window.confirm('Normalize long summaries in ingested events and published draft summaries?');
        if (!confirmed) {
          return;
        }
        setStatus('Normalizing long summaries...', '');
        const body = await api('/api/admin/ingestion/normalize-summaries', { method: 'POST' });
        await loadIngestions();
        const result = body.result || {};
        setStatus(
          'Normalization complete. scanned_events=' + (result.scannedEvents || 0) +
          ', updated_events=' + (result.updatedEvents || 0) +
          ', scanned_draft_summaries=' + (result.scannedDraftSummaries || 0) +
          ', updated_draft_summaries=' + (result.updatedDraftSummaries || 0) +
          ', unchanged=' + (result.unchanged || 0) + '.',
          'ok'
        );
      } catch (error) {
        setStatus(error.message || 'Action failed', 'err');
      }
    });

    resetIngestionBtn.addEventListener('click', async () => {
      try {
        const confirmed = window.confirm('This deletes all ingested events and drafts. Continue?');
        if (!confirmed) {
          return;
        }
        setStatus('Resetting ingestion DB...', '');
        const body = await api('/api/admin/ingestion/reset', { method: 'POST' });
        await loadIngestions();
        setStatus('Reset complete. Deleted drafts=' + (body.deletedDrafts || 0) + ', events=' + (body.deletedEvents || 0) + '.', 'ok');
      } catch (error) {
        setStatus(error.message || 'Action failed', 'err');
      }
    });

    clearIncidentsBtn.addEventListener('click', async () => {
      try {
        const confirmed = window.confirm('This will remove all published incidents from /incidents. Continue?');
        if (!confirmed) {
          return;
        }
        setStatus('Clearing incidents...', '');
        const body = await api('/api/admin/incidents/clear', { method: 'POST' });
        await loadIngestions();
        setStatus('Cleared ' + (body.cleared || 0) + ' published incidents.', 'ok');
      } catch (error) {
        setStatus(error.message || 'Action failed', 'err');
      }
    });

    ingestionsEl.addEventListener('click', async (event) => {
      const target = event.target;
      if (!target || !target.dataset) {
        return;
      }
      const action = target.dataset.action;
      if (!action) {
        return;
      }

      try {
        if (action === 'create-draft') {
          const eventId = target.dataset.eventId;
          if (!eventId) {
            return;
          }
          setStatus('Creating draft for ingestion ' + eventId + '...', '');
          const created = await api('/api/admin/ingestions/' + eventId + '/create-draft', { method: 'POST' });
          await loadIngestions();
          setStatus(
            created.inserted
              ? 'Draft created for ingestion ' + eventId + '.'
              : 'Draft already exists for ingestion ' + eventId + '.',
            'ok'
          );
          return;
        }

        const draftId = target.dataset.draftId;
        if (!draftId) {
          return;
        }
        setStatus('Updating draft ' + draftId + '...', '');
        if (action === 'approve') {
          await api('/api/admin/drafts/' + draftId + '/approve', { method: 'POST' });
          await loadIngestions();
          setStatus('Draft ' + draftId + ' approved. Click "Publish to Incidents" to make it public.', 'ok');
          return;
        }
        if (action === 'publish') {
          const publish = await api('/api/admin/drafts/' + draftId + '/publish', { method: 'POST' });
          await loadIngestions();
          if (publish.enrichmentError) {
            setStatus('Draft ' + draftId + ' published at /incidents/' + (publish.slug || '') + ', but GPT rewrite failed: ' + publish.enrichmentError, 'err');
          } else {
            setStatus('Draft ' + draftId + ' published at /incidents/' + (publish.slug || '') + ' (GPT rewrite attempted).', 'ok');
          }
          return;
        }
        if (action === 'remove-incident') {
          await api('/api/admin/incidents/' + draftId + '/remove', { method: 'POST' });
          await loadIngestions();
          setStatus('Incident ' + draftId + ' removed from /incidents.', 'ok');
          return;
        }
        await loadIngestions();
        setStatus('Draft ' + draftId + ' updated.', 'ok');
      } catch (error) {
        setStatus(error.message || 'Action failed', 'err');
      }
    });
  </script>
</body>
</html>`;
}

export function renderAdminMetricsPage(siteUrl?: string): string {
  const seoSnippet = renderSeoMeta({
    title: 'Admin Metrics | AI Security Radar',
    description: 'Validation and funnel metrics for AI Security Radar.',
    canonicalPath: '/admin/metrics',
    siteUrl,
    type: 'website',
    noindex: true,
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Metrics - AI Security Radar</title>
  ${seoSnippet}
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin:0; background:#f7f5ef; color:#1c1915; }
    .wrap { max-width: 1040px; margin: 0 auto; padding: 20px 16px 48px; }
    .panel { background:#fffdf9; border:1px solid #ddd6c8; padding:16px; margin-bottom:12px; }
    .grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:10px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
    .metric { border:1px solid #d9d2c7; background:#fff; padding:10px; }
    .muted { color:#5f584f; font-size:13px; }
    table { width:100%; border-collapse:collapse; background:#fff; }
    th, td { border:1px solid #ddd6c8; padding:8px; font-size:13px; text-align:left; }
    th { background:#f5f2ec; }
    .btn { border:1px solid #1d3644; background:#1d3644; color:#fff; padding:8px 12px; cursor:pointer; }
    input[type="password"] { width: 100%; max-width:420px; padding:10px; border:1px solid #9e978c; box-sizing:border-box; margin-bottom:10px; }
    .status-err { color:#a71f1c; }
    .status-ok { color:#1f6d35; }
  </style>
</head>
<body>
  <main class="wrap">
    ${renderSiteHeader()}
    <section class="panel">
      <h1>Validation Metrics</h1>
      <p class="muted">Use admin bearer token to load demand and funnel metrics for Phase 0.</p>
      <label for="token">Admin Token</label>
      <input id="token" type="password" autocomplete="off" />
      <div><button class="btn" id="load-btn" type="button">Load Metrics</button></div>
      <p id="status" class="muted"></p>
    </section>
    <section class="panel">
      <div class="grid">
        <div class="metric"><strong>Total signups</strong><div id="m-total">-</div></div>
        <div class="metric"><strong>Last 7 days</strong><div id="m-7d">-</div></div>
        <div class="metric"><strong>Top source</strong><div id="m-top-source">-</div></div>
        <div class="metric"><strong>Top UTM source</strong><div id="m-top-utm">-</div></div>
      </div>
    </section>
    <section class="panel">
      <h2>Daily Signups (30 days)</h2>
      <div id="daily"></div>
    </section>
    <section class="panel">
      <h2>Source Breakdown</h2>
      <div id="sources"></div>
    </section>
    ${renderSiteFooter()}
  </main>
  <script>
    const tokenEl = document.getElementById('token');
    const statusEl = document.getElementById('status');
    const loadBtn = document.getElementById('load-btn');
    const dailyEl = document.getElementById('daily');
    const sourcesEl = document.getElementById('sources');
    const mTotal = document.getElementById('m-total');
    const m7d = document.getElementById('m-7d');
    const mTopSource = document.getElementById('m-top-source');
    const mTopUtm = document.getElementById('m-top-utm');

    function setStatus(message, kind) {
      statusEl.textContent = message || '';
      statusEl.className = kind ? 'muted status-' + kind : 'muted';
    }

    function table(headers, rows) {
      const head = '<tr>' + headers.map((h) => '<th>' + h + '</th>').join('') + '</tr>';
      const body = rows.map((r) => '<tr>' + r.map((c) => '<td>' + String(c) + '</td>').join('') + '</tr>').join('');
      return '<table><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
    }

    async function loadMetrics() {
      const token = tokenEl.value.trim();
      if (!token) throw new Error('Admin token is required.');
      const res = await fetch('/api/admin/metrics', { headers: { Authorization: 'Bearer ' + token } });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error || 'Failed to load metrics');
      return body;
    }

    loadBtn.addEventListener('click', async () => {
      try {
        setStatus('Loading metrics...', '');
        const body = await loadMetrics();
        mTotal.textContent = String(body.summary.totalSignups || 0);
        m7d.textContent = String(body.summary.signupsLast7d || 0);
        mTopSource.textContent = body.summary.topSource || '(none)';
        mTopUtm.textContent = body.summary.topUtmSource || '(none)';
        dailyEl.innerHTML = table(['Day', 'Signups'], (body.daily || []).map((r) => [r.day, r.count]));
        sourcesEl.innerHTML = table(['Source', 'Count'], (body.sources || []).map((r) => [r.source, r.count]));
        setStatus('Metrics loaded.', 'ok');
      } catch (error) {
        setStatus(error.message || 'Failed to load metrics', 'err');
      }
    });
  </script>
</body>
</html>`;
}
