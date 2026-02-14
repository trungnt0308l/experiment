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
      --bg: #f6f4ef;
      --ink: #161410;
      --danger: #b3211e;
      --accent: #1d6f8f;
      --card: #fffdf9;
      --line: #dfd9cd;
    }
    body {
      margin: 0;
      font-family: Georgia, "Times New Roman", serif;
      color: var(--ink);
      background: radial-gradient(circle at top right, #ead9c8, transparent 40%), var(--bg);
      line-height: 1.4;
    }
    .wrap {
      max-width: 980px;
      margin: 0 auto;
      padding: 28px 16px 48px;
    }
    .hero {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 24px;
    }
    h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.1; }
    .risk { color: var(--danger); font-weight: 700; }
    p { margin: 0 0 12px; font-size: 18px; }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-top: 16px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 16px;
    }
    .option-list {
      border: 1px solid #9e978c;
      border-radius: 3px;
      padding: 10px;
      margin-bottom: 12px;
      background: #fff;
    }
    .option-item {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .option-item:last-child { margin-bottom: 0; }
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
    }
    input[type="checkbox"] {
      width: auto;
      margin: 0;
      flex: 0 0 auto;
    }
    button {
      border: 0;
      background: var(--danger);
      color: #fff;
      padding: 12px 14px;
      font-size: 16px;
      cursor: pointer;
      width: 100%;
    }
    .small { font-size: 13px; color: #4d483f; margin-top: 8px; }
    .ok { color: #0f6f2e; }
    .err { color: var(--danger); }
    @media (max-width: 820px) {
      .grid { grid-template-columns: 1fr; }
      h1 { font-size: 30px; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <h1>When AI security incidents break, <span class="risk">speed is the difference between containment and damage.</span></h1>
      <p>${appName} continuously monitors AI security signals and delivers source-backed alerts with clear next steps your team can act on in minutes.</p>
      <p>Join the waitlist to get launch access, sample alert packs, and priority onboarding.</p>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>What you get</h2>
        <p>- Early warning on AI security incidents relevant to your stack and policies.</p>
        <p>- Incident briefs with severity, business impact, and immediate remediation actions.</p>
        <p>- Source citations for fast internal validation and compliance evidence.</p>
        <p>- Delivery to channels your team already uses: Email and Telegram.</p>
      </article>

      <form class="panel" id="waitlist-form" method="post" action="/api/waitlist">
        <h2>Request access</h2>
        <label for="email">Work Email</label>
        <input id="email" name="email" type="email" required />

        <label for="company">Company</label>
        <input id="company" name="company" type="text" required />

        <label for="role">Role</label>
        <input id="role" name="role" type="text" required />

        <label>What risks do you need help monitoring right now? (Select all that apply)</label>
        <div class="option-list" role="group" aria-label="Risk interests">
          <label class="option-item"><input type="checkbox" name="riskOption" value="Prompt injection attacks" /> Prompt injection attacks</label>
          <label class="option-item"><input type="checkbox" name="riskOption" value="Data leakage in AI tools" /> Data leakage in AI tools</label>
          <label class="option-item"><input type="checkbox" name="riskOption" value="Shadow AI usage" /> Shadow AI usage</label>
          <label class="option-item"><input type="checkbox" name="riskOption" value="Model supply chain risk" /> Model supply chain risk</label>
          <label class="option-item"><input type="checkbox" name="riskOption" value="Compliance and regulatory exposure" /> Compliance and regulatory exposure</label>
          <label class="option-item"><input type="checkbox" name="riskOption" value="Agent abuse and privilege misuse" /> Agent abuse and privilege misuse</label>
        </div>

        <input type="hidden" id="interests" name="interests" value="" />

        <input type="hidden" name="source" value="landing-page" />
        <input type="hidden" name="utmSource" id="utmSource" value="" />
        <input type="hidden" name="utmMedium" id="utmMedium" value="" />
        <input type="hidden" name="utmCampaign" id="utmCampaign" value="" />
        <input type="hidden" name="referrer" id="referrer" value="" />
        <input type="hidden" name="landingPath" id="landingPath" value="" />

        <button type="submit">Get Early Access</button>
        <p id="status" class="small" aria-live="polite"></p>
      </form>
    </section>
  </main>

  <script>
    const form = document.getElementById('waitlist-form');
    const status = document.getElementById('status');
    const params = new URLSearchParams(window.location.search);

    const setField = (id, value) => {
      const el = document.getElementById(id);
      if (el) {
        el.value = value || '';
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

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = 'Submitting...';
      status.className = 'small';

      const formData = new FormData(form);
      const selectedRisks = Array.from(form.querySelectorAll('input[name="riskOption"]:checked'))
        .map((el) => el.value)
        .join(', ');

      if (!selectedRisks) {
        status.textContent = 'Please select at least one risk area.';
        status.className = 'small err';
        return;
      }

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
      }
      status.className = 'small ok';
    });
  </script>
</body>
</html>`;
}
