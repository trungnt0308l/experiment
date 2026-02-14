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

export function renderLandingPage(appName: string, gaMeasurementId?: string): string {
  const gaSnippet = gaMeasurementId
    ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${gaMeasurementId}');
  </script>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName}</title>
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
    .hero {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 22px;
      margin-bottom: 14px;
    }
    h1 { margin: 0 0 12px; font-size: 37px; line-height: 1.06; }
    .risk { color: var(--danger); font-weight: 700; }
    p { margin: 0 0 12px; font-size: 18px; }
    .sub { color: var(--muted); font-size: 16px; }
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
    .option-list {
      border: 1px solid #9e978c;
      border-radius: 3px;
      padding: 10px;
      margin-bottom: 12px;
      background: #fff;
    }
    .option-item { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 14px; }
    .option-item:last-child { margin-bottom: 0; }
    input[type="checkbox"] { width: auto; margin: 0; flex: 0 0 auto; }
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
    footer {
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
    <header class="topbar">
      <div class="brand"><span class="mark">ASR</span> ${appName}</div>
      <div class="nav">
        <a class="link-btn" href="/incidents">Recent Incidents</a>
        <a class="link-btn" href="#waitlist-form">Get Access</a>
      </div>
    </header>

    <section class="hero">
      <h1>When AI security incidents break, <span class="risk">minutes decide the outcome.</span></h1>
      <p>Get verified AI threat alerts with immediate remediation actions so your team can contain risk before it turns into a breach or compliance event.</p>
      <p class="sub">Built for security and risk teams that need faster awareness, better evidence, and clearer response ownership.</p>
    </section>

    <section class="proof-row" aria-label="Data sources">
      <div class="proof">Monitors X security signals</div>
      <div class="proof">Tracks Hacker News and advisories</div>
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
        <div class="alert-card">
          <div class="severity">High Severity</div>
          <div><strong>Prompt-injection chain seen in production chatbot integrations.</strong></div>
          <div class="sub">Risk: sensitive data exposure via tool calls and instruction override.</div>
          <div class="sub">Immediate action: disable risky tool scopes, apply prompt guardrails, rotate exposed tokens, and audit logs.</div>
          <div class="links"><a href="#">Source 1</a><a href="#">Source 2</a></div>
        </div>
      </article>

      <form class="panel" id="waitlist-form" method="post" action="/api/waitlist">
        <h2>Request Access</h2>
        <div id="step1">
          <label for="email">Work Email</label>
          <input id="email" name="email" type="email" required />

          <label>Which risks should we monitor for you? (Select all that apply)</label>
          <div class="option-list" role="group" aria-label="Risk interests">
            <label class="option-item"><input type="checkbox" name="riskOption" value="Prompt injection attacks" /> Prompt injection attacks</label>
            <label class="option-item"><input type="checkbox" name="riskOption" value="Data leakage in AI tools" /> Data leakage in AI tools</label>
            <label class="option-item"><input type="checkbox" name="riskOption" value="Shadow AI usage" /> Shadow AI usage</label>
            <label class="option-item"><input type="checkbox" name="riskOption" value="Model supply chain risk" /> Model supply chain risk</label>
            <label class="option-item"><input type="checkbox" name="riskOption" value="Compliance and regulatory exposure" /> Compliance and regulatory exposure</label>
            <label class="option-item"><input type="checkbox" name="riskOption" value="Agent abuse and privilege misuse" /> Agent abuse and privilege misuse</label>
          </div>
          <div class="actions">
            <button type="button" id="continue-btn" class="secondary">Continue</button>
          </div>
        </div>

        <div id="step2" style="display:none">
          <label for="company">Company</label>
          <input id="company" name="company" type="text" required />

          <label for="role">Role</label>
          <input id="role" name="role" type="text" required />

          <div class="actions">
            <button type="submit">Get Early Access</button>
          </div>
        </div>

        <input type="hidden" id="interests" name="interests" value="" />
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

    <footer>
      <span>AI Security Radar</span>
      <span>Contact: security@aisecurityradar.com</span>
      <span>© 2026 AI Security Radar</span>
    </footer>
  </main>

  <script>
    const form = document.getElementById('waitlist-form');
    const status = document.getElementById('status');
    const params = new URLSearchParams(window.location.search);
    const continueBtn = document.getElementById('continue-btn');
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const emailInput = document.getElementById('email');

    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.value = value || '';
    };

    const utmSource = params.get('utm_source') || '';
    const utmMedium = params.get('utm_medium') || '';
    const utmCampaign = params.get('utm_campaign') || '';
    setField('utmSource', utmSource);
    setField('utmMedium', utmMedium);
    setField('utmCampaign', utmCampaign);
    setField('referrer', document.referrer || 'direct');
    setField('landingPath', window.location.pathname + window.location.search);

    const getSelectedRisks = () => Array.from(form.querySelectorAll('input[name="riskOption"]:checked'))
      .map((el) => el.value)
      .join(', ');

    continueBtn.addEventListener('click', () => {
      if (!emailInput.checkValidity()) {
        emailInput.reportValidity();
        return;
      }
      const selectedRisks = getSelectedRisks();
      if (!selectedRisks) {
        status.textContent = 'Please select at least one risk area.';
        status.className = 'small err';
        return;
      }
      document.getElementById('interests').value = selectedRisks;
      step1.style.display = 'none';
      step2.style.display = 'block';
      status.textContent = '';
      status.className = 'small';
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = 'Submitting...';
      status.className = 'small';

      const selectedRisks = getSelectedRisks();
      if (!selectedRisks) {
        status.textContent = 'Please select at least one risk area.';
        status.className = 'small err';
        step1.style.display = 'block';
        step2.style.display = 'none';
        return;
      }

      const formData = new FormData(form);
      formData.set('interests', selectedRisks);

      const response = await fetch('/api/waitlist', {
        method: 'POST',
        body: formData,
      });

      const body = await response.json();
      if (!response.ok) {
        status.textContent = 'Please check your input and try again.';
        status.className = 'small err';
        return;
      }

      if (body.status === 'already_joined') {
        status.textContent = 'You are already on the waitlist. We will contact you soon.';
      } else {
        status.textContent = 'Request received. We will send access details shortly.';
        form.reset();
        step1.style.display = 'block';
        step2.style.display = 'none';
      }
      status.className = 'small ok';
    });
  </script>
</body>
</html>`;
}

export function renderIncidentsPage(incidents: IncidentEntry[]): string {
  const cards = incidents
    .map(
      (item) => `<article style="border:1px solid #ddd6c8;background:#fffdf9;padding:16px;margin-bottom:12px;">
        <h2 style="margin:0 0 8px;font-size:24px;"><a href="/incidents/${item.slug}" style="color:#1a1815;text-decoration:none;">${item.title}</a></h2>
        <p style="margin:0 0 8px;font-size:14px;color:#5f584f;">Incident date: ${item.incidentDate} | Published: ${item.publishedDate}</p>
        <p style="margin:0 0 8px;">${item.summary}</p>
        <p style="margin:0;"><a href="/incidents/${item.slug}" style="color:#135d7a;">Read details</a></p>
      </article>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recent AI Security Incidents</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background:#f7f5ef; color:#1c1915; }
    main { max-width: 900px; margin: 0 auto; padding: 24px 16px 48px; }
    h1 { margin-top: 0; }
    .back { margin-bottom: 14px; display:inline-block; color:#135d7a; }
  </style>
</head>
<body>
  <main>
    <a class="back" href="/">Back to homepage</a>
    <h1>Recent AI Security Incidents</h1>
    <p>Curated incidents with impact and remediation notes.</p>
    ${cards}
  </main>
</body>
</html>`;
}

export function renderIncidentDetailPage(incident: IncidentEntry, allIncidents: IncidentEntry[]): string {
  const remedies = incident.remedy.map((step) => `<li>${step}</li>`).join('');
  const sourceLinks = incident.sources
    .map((source) => `<li><a href="${source.url}" target="_blank" rel="noopener noreferrer">${source.label}</a></li>`)
    .join('');
  const otherItems = allIncidents
    .filter((item) => item.slug !== incident.slug)
    .slice(0, 3)
    .map((item) => `<li><a href="/incidents/${item.slug}">${item.title}</a></li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${incident.title}</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background:#f7f5ef; color:#1c1915; }
    main { max-width: 900px; margin: 0 auto; padding: 24px 16px 48px; }
    article { border:1px solid #ddd6c8;background:#fffdf9;padding:18px; }
    h1 { margin-top: 0; }
    .meta { color:#5f584f; font-size:14px; margin-bottom: 10px; }
    a { color:#135d7a; }
  </style>
</head>
<body>
  <main>
    <p><a href="/incidents">Back to incidents</a></p>
    <article>
      <h1>${incident.title}</h1>
      <p class="meta">Incident date: ${incident.incidentDate} | Published: ${incident.publishedDate}</p>
      <p>${incident.summary}</p>
      <h2>Impact</h2>
      <p>${incident.impact}</p>
      <h2>Recommended Response</h2>
      <ul>${remedies}</ul>
      <h2>Sources</h2>
      <ul>${sourceLinks}</ul>
    </article>
    <section style="margin-top:14px;">
      <h3>More incidents</h3>
      <ul>${otherItems}</ul>
    </section>
  </main>
</body>
</html>`;
}

function renderPolicyShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} - AI Security Radar</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; margin: 0; background: #f7f5ef; color: #1c1915; }
    main { max-width: 860px; margin: 0 auto; padding: 24px 16px 48px; }
    article { background: #fffdf9; border: 1px solid #ddd6c8; padding: 20px; }
    h1 { margin-top: 0; }
    h2 { margin-top: 18px; font-size: 20px; }
    p, li { font-size: 16px; line-height: 1.45; }
    a { color: #135d7a; }
  </style>
</head>
<body>
  <main>
    <article>
      <h1>${title}</h1>
      ${body}
      <p><a href="/">Back to homepage</a></p>
    </article>
  </main>
</body>
</html>`;
}

export function renderPrivacyPage(): string {
  return renderPolicyShell(
    'Privacy Policy',
    `
    <p>Last updated: February 14, 2026</p>
    <p>We collect contact and profile information that you submit in the waitlist form, along with attribution metadata (for example UTM parameters) for demand analysis.</p>
    <h2>What We Collect</h2>
    <ul>
      <li>Work email, company, role, and selected risk interests.</li>
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
    `
  );
}

export function renderTermsPage(): string {
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
    `
  );
}

export function renderSecurityPage(): string {
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
    `
  );
}
