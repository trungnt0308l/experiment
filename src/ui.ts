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
    label { display: block; font-size: 14px; margin-bottom: 6px; }
    input, textarea {
      width: 100%;
      border: 1px solid #9e978c;
      border-radius: 3px;
      padding: 10px;
      font-size: 15px;
      margin-bottom: 12px;
      box-sizing: border-box;
      font-family: inherit;
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
      <h1>Your team will miss AI security incidents. <span class="risk">The cost is waiting too long to react.</span></h1>
      <p>${appName} monitors emerging AI threats and delivers evidence-backed alerts with concrete actions your team can execute immediately.</p>
      <p>Join the waitlist to get early access, sample alerts, and priority onboarding.</p>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>Why teams join</h2>
        <p>- Detect AI-related security incidents before they become internal fire drills.</p>
        <p>- Get concise alerts with severity, likely impact, and immediate remediation steps.</p>
        <p>- Respond faster with source links your security and compliance team can verify.</p>
        <p>- Receive alerts where your team already works: Email and Telegram.</p>
      </article>

      <form class="panel" id="waitlist-form" method="post" action="/api/waitlist">
        <h2>Get early access</h2>
        <label for="email">Work Email</label>
        <input id="email" name="email" type="email" required />

        <label for="company">Company</label>
        <input id="company" name="company" type="text" required />

        <label for="role">Role</label>
        <input id="role" name="role" type="text" required />

        <label for="interests">What risk do you need help monitoring right now?</label>
        <textarea id="interests" name="interests" rows="3" required></textarea>

        <input type="hidden" name="source" value="landing-page" />
        <input type="hidden" name="utmSource" id="utmSource" value="" />
        <input type="hidden" name="utmMedium" id="utmMedium" value="" />
        <input type="hidden" name="utmCampaign" id="utmCampaign" value="" />
        <input type="hidden" name="referrer" id="referrer" value="" />
        <input type="hidden" name="landingPath" id="landingPath" value="" />

        <button type="submit">Reserve Early Access</button>
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
        status.textContent = 'You are already on the list. We will contact you soon.';
      } else {
        status.textContent = 'You are in. We will send onboarding details shortly.';
        form.reset();
      }
      status.className = 'small ok';
    });
  </script>
</body>
</html>`;
}
