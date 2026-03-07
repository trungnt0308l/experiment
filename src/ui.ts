export type IncidentSource = {
  label: string;
  url: string;
};

export type IncidentSourceKind = 'hn' | 'nvd' | 'rss' | 'ghsa' | 'cisa_kev' | 'euvd' | 'unknown';

export type IncidentEntry = {
  slug: string;
  title: string;
  sourceTitle?: string;
  sortDate: string;
  incidentDate: string;
  publishedDate: string;
  summary: string;
  impact: string;
  remedy: string[];
  sources: IncidentSource[];
  sourceKind?: IncidentSourceKind;
  severity?: 'low' | 'medium' | 'high';
  confidence?: number | null;
  indexable?: boolean;
  qualityReasons?: string[];
};

export type LandingSampleAlert = {
  title: string;
  incidentUrl: string;
  severity: string;
  summary: string;
  remedy: string;
  sourceLabel: string;
  sourceUrl: string;
};

export type IncidentsPageMeta = {
  currentPage: number;
  totalPages: number;
  totalIncidents: number;
  prevPagePath?: string;
  nextPagePath?: string;
  siteUrl?: string;
};

export type IncidentQualityAssessment = {
  indexable: boolean;
  aiSignals: string[];
  reasons: string[];
  summaryLength: number;
  hasSpecificImpact: boolean;
  hasSpecificRemedy: boolean;
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text: string, term: string): boolean {
  const pattern = term
    .trim()
    .split(/\s+/)
    .map((part) => escapeRegExp(part))
    .join('\\s+');
  return new RegExp(`(^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i').test(text);
}

const INCIDENT_AI_SIGNALS = [
  'artificial intelligence',
  'generative ai',
  'genai',
  'llm',
  'large language model',
  'machine learning',
  'foundation model',
  'prompt injection',
  'jailbreak',
  'ai agent',
  'copilot',
  'chatgpt',
  'openai',
  'anthropic',
  'claude',
  'gemini',
  'langchain',
  'llamaindex',
  'mindsdb',
  'keras',
  'fickling',
  'picklescan',
  'hugging face',
  'model weights',
  'ml pipeline',
];

const GENERIC_IMPACT_PATTERNS = [
  /^severity\s+(low|medium|high)\.\s+confidence/i,
  /^severity\s+(low|medium|high)\s+with confidence/i,
];

const GENERIC_REMEDY_STARTS = [
  'validate whether your organization uses the affected ai tool',
  'confirm whether affected products, models, or integrations are used',
  'apply vendor patches or mitigations and restrict risky permissions',
  'apply vendor fixes or mitigations and restrict risky permissions',
  'monitor logs for related indicators and document containment',
];

function normalizeForAnalysis(value: string): string {
  return normalizeWhitespace(stripHtmlTags(value)).toLowerCase();
}

function uniqueTerms(text: string, terms: string[]): string[] {
  const found = new Set<string>();
  for (const term of terms) {
    if (containsTerm(text, term)) {
      found.add(term);
    }
  }
  return [...found];
}

function startsWithAny(text: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => text.startsWith(prefix));
}

function hasSpecificRemedy(remedy: string[]): boolean {
  if (remedy.length < 2) {
    return false;
  }
  const normalized = remedy.map((item) => normalizeForAnalysis(item));
  const genericCount = normalized.filter((item) => startsWithAny(item, GENERIC_REMEDY_STARTS)).length;
  return genericCount < Math.min(2, normalized.length);
}

export function assessIncidentQuality(incident: IncidentEntry): IncidentQualityAssessment {
  const titleText = normalizeForAnalysis(incident.sourceTitle ?? incident.title.replace(/^AI security incident:\s*/i, ''));
  const summaryText = normalizeForAnalysis(incident.summary);
  const impactText = normalizeForAnalysis(incident.impact);
  const combined = `${titleText} ${summaryText} ${impactText}`;
  const aiSignals = uniqueTerms(combined, INCIDENT_AI_SIGNALS);
  const summaryLength = normalizeWhitespace(stripHtmlTags(incident.summary)).length;
  const impactLooksGeneric = GENERIC_IMPACT_PATTERNS.some((pattern) => pattern.test(normalizeWhitespace(stripHtmlTags(incident.impact))));
  const specificRemedy = hasSpecificRemedy(incident.remedy);
  const reasons: string[] = [];
  const confidence = typeof incident.confidence === 'number' ? incident.confidence : null;

  if (aiSignals.length === 0) {
    reasons.push('Weak AI-specific context');
  }
  if (summaryLength < 140) {
    reasons.push('Incident summary is thin');
  }
  if (impactLooksGeneric) {
    reasons.push('Impact narrative is generic');
  }
  if (!specificRemedy) {
    reasons.push('Response guidance is generic');
  }
  if (confidence !== null && confidence < 0.6) {
    reasons.push('Low confidence classification');
  }

  const indexable = aiSignals.length > 0 && summaryLength >= 140 && (confidence === null || confidence >= 0.6);
  return {
    indexable,
    aiSignals,
    reasons,
    summaryLength,
    hasSpecificImpact: !impactLooksGeneric,
    hasSpecificRemedy: specificRemedy,
  };
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

function formatConfidence(confidence: number | null | undefined): string {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return 'Unscored';
  }
  return `${Math.round(confidence * 100)}%`;
}

function humanizeSourceKind(sourceKind: IncidentSourceKind | undefined): string {
  switch (sourceKind) {
    case 'ghsa':
      return 'GitHub Security Advisory';
    case 'nvd':
      return 'NVD';
    case 'cisa_kev':
      return 'CISA KEV';
    case 'euvd':
      return 'EUVD';
    case 'rss':
      return 'RSS advisory';
    case 'hn':
      return 'Hacker News signal';
    default:
      return 'Source advisory';
  }
}

function classifyIncident(text: string): {
  attackPath: string;
  affectedSurface: string;
  detectionSignals: string[];
  businessImpact: string;
} {
  const normalized = text.toLowerCase();

  if (containsTerm(normalized, 'prompt injection') || containsTerm(normalized, 'jailbreak')) {
    return {
      attackPath: 'Untrusted prompts or tool instructions can override intended guardrails, then trigger data access or unsafe downstream actions.',
      affectedSurface: 'LLM prompts, agent workflows, retrieval layers, and connected tools should be reviewed first.',
      detectionSignals: [
        'Unexpected tool invocation chains after user prompts',
        'Prompt logs that include instruction override patterns or policy bypass text',
        'Retrieval or plugin calls that expose sensitive internal context',
      ],
      businessImpact: 'Prompt-layer weaknesses can expose regulated data, create unsafe actions, and weaken audit evidence around AI control boundaries.',
    };
  }

  if (
    containsTerm(normalized, 'remote code execution') ||
    containsTerm(normalized, 'arbitrary code execution') ||
    containsTerm(normalized, 'command injection') ||
    containsTerm(normalized, 'rce')
  ) {
    return {
      attackPath: 'An attacker can turn the vulnerable AI-adjacent component into a path for command execution on the host or service runtime.',
      affectedSurface: 'Review AI plugins, copilots, model-serving helpers, CLI tools, and automation runtimes that execute system commands.',
      detectionSignals: [
        'New shell or process activity from AI-facing services',
        'Unexpected outbound connections or file writes after prompt or API activity',
        'Privilege changes, container escapes, or suspicious job execution logs',
      ],
      businessImpact: 'Code execution paths create immediate risk of host compromise, credential theft, and downstream lateral movement.',
    };
  }

  if (
    containsTerm(normalized, 'deserialization') ||
    containsTerm(normalized, 'pickle') ||
    containsTerm(normalized, 'model weights')
  ) {
    return {
      attackPath: 'The malicious payload is embedded in model artifacts or serialized objects, then executes or bypasses scanning during load and inspection.',
      affectedSurface: 'Model registries, artifact scanners, notebook workflows, and CI/CD steps that handle model files need immediate review.',
      detectionSignals: [
        'New or unsigned model artifacts entering the registry',
        'Scanner output gaps for pickle or custom model formats',
        'Unexpected code paths during model loading or validation jobs',
      ],
      businessImpact: 'Model artifact compromise undermines trust in the training and deployment chain and can create stealthy persistence in ML workflows.',
    };
  }

  if (
    containsTerm(normalized, 'exfiltration') ||
    containsTerm(normalized, 'data leak') ||
    containsTerm(normalized, 'file disclosure') ||
    containsTerm(normalized, 'ssrf')
  ) {
    return {
      attackPath: 'The flaw creates an unauthorized path to fetch, read, or exfiltrate sensitive data from connected systems or local files.',
      affectedSurface: 'Review connectors, retrieval plugins, webhook targets, file access paths, and outbound network policies around AI services.',
      detectionSignals: [
        'Unexpected outbound requests from AI application components',
        'Access to internal metadata endpoints, local files, or restricted datasets',
        'Downloads or responses that contain internal documents, secrets, or embeddings',
      ],
      businessImpact: 'Data exposure creates direct confidentiality risk and can trigger incident notification, contractual, and regulatory obligations.',
    };
  }

  if (
    containsTerm(normalized, 'account takeover') ||
    containsTerm(normalized, 'authentication bypass') ||
    containsTerm(normalized, 'authorization bypass') ||
    containsTerm(normalized, 'privilege escalation')
  ) {
    return {
      attackPath: 'The weakness can let an attacker bypass identity checks or gain higher privileges inside an AI-facing product or workflow.',
      affectedSurface: 'Audit SSO, service tokens, plugin credentials, user-to-tool permissions, and admin actions exposed through AI features.',
      detectionSignals: [
        'Unexpected admin actions or scope changes from AI-related users',
        'Authentication events that skip normal challenge or approval steps',
        'New tokens, integrations, or role assignments created without expected workflow traces',
      ],
      businessImpact: 'Identity control failures can expand blast radius quickly because AI tools often bridge multiple internal systems and datasets.',
    };
  }

  if (containsTerm(normalized, 'denial of service') || containsTerm(normalized, 'dos')) {
    return {
      attackPath: 'An attacker can drive resource exhaustion or crash conditions in the vulnerable component through crafted traffic or content.',
      affectedSurface: 'Check inference endpoints, parsing layers, queues, and file processing jobs that support AI features.',
      detectionSignals: [
        'Latency spikes or worker restarts on AI-serving endpoints',
        'Memory or CPU saturation after malformed requests or artifacts',
        'Queue backlogs, timeouts, or repeated crash loops in model services',
      ],
      businessImpact: 'Availability failures can interrupt customer-facing AI features and force emergency rollback or capacity isolation.',
    };
  }

  return {
    attackPath: 'The advisory indicates a security path that can affect AI applications, assistants, models, or connected automation workflows if the component is deployed.',
    affectedSurface: 'Review the AI product, dependency, and integration points mentioned in the source advisory before broadening remediation.',
    detectionSignals: [
      'New security events tied to the affected component or advisory identifier',
      'Changes in AI workflow behavior, access logs, or plugin execution after the advisory window',
      'Evidence that the vulnerable version is active in environments that process sensitive data',
    ],
    businessImpact: 'Even when exploit details are still emerging, delayed triage can widen operational and compliance exposure around AI systems.',
  };
}

function buildAiRelevanceSummary(incident: IncidentEntry, aiSignals: string[]): string {
  if (aiSignals.length > 0) {
    const labels = aiSignals.slice(0, 3).join(', ');
    return `This page is treated as AI-specific because the source material references ${labels}, which places the issue inside an AI workflow, model, assistant, or supporting dependency rather than a generic software bulletin.`;
  }
  return `This advisory is part of the public incident archive, but the current source material uses limited explicit AI terminology, so the cited sources should be reviewed carefully when judging AI relevance and exposure.`;
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

function incidentsPagePath(page: number): string {
  return page <= 1 ? '/incidents' : `/incidents/page/${page}`;
}

function renderPaginationLinkTags(prevPath: string | undefined, nextPath: string | undefined, siteUrl?: string): string {
  const links: string[] = [];
  if (prevPath) {
    links.push(`<link rel="prev" href="${escapeAttr(absoluteUrl(siteUrl, prevPath))}" />`);
  }
  if (nextPath) {
    links.push(`<link rel="next" href="${escapeAttr(absoluteUrl(siteUrl, nextPath))}" />`);
  }
  return links.join('\n');
}

function renderJsonLd(value: Record<string, unknown>): string {
  const body = JSON.stringify(value).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${body}</script>`;
}

function renderSiteHeader(appName = 'AI Security Radar'): string {
  return `<header class="topbar">
      <a class="brand-link" href="/" aria-label="${escapeHtml(appName)} homepage">
        <div class="brand"><span class="mark">ASR</span> ${escapeHtml(appName)}</div>
      </a>
      <div class="nav">
        <a class="link-btn" href="/methodology">Methodology</a>
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
      <span><a href="/methodology">Methodology</a> | <a href="/privacy">Privacy</a> | <a href="/terms">Terms</a> | <a href="/security">Security</a></span>
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
    title: `${appName} | AI Security Incident Monitoring for Security Teams`,
    description:
      'AI Security Radar monitors AI-specific advisories, prompt-injection incidents, model supply-chain risks, and assistant security issues, then delivers source-cited remediation guidance for security teams.',
    canonicalPath: '/',
    siteUrl,
    type: 'website',
  });
  const faqItems = [
    {
      question: 'What does AI Security Radar do?',
      answer:
        'AI Security Radar tracks trusted incident and advisory feeds, then sends source-cited alerts with likely impact and remediation guidance.',
    },
    {
      question: 'Why register before a major incident hits?',
      answer:
        'Teams that register early receive faster awareness and action checklists, reducing the chance that delayed triage turns into a larger breach window.',
    },
    {
      question: 'What evidence do alerts include?',
      answer:
        'Each alert includes source citations, severity context, and concrete response steps so security and compliance teams can document decisions quickly.',
    },
    {
      question: 'Which incidents are considered AI-specific?',
      answer:
        'We focus on incidents tied to AI assistants, copilots, LLM workflows, model artifacts, prompt injection, and AI-relevant dependencies rather than generic software advisories with weak AI overlap.',
    },
    {
      question: 'Are all published incident pages indexable?',
      answer:
        'Yes. Once an incident page is published, it remains indexable and stays in the sitemap. We handle quality issues through updates and corrections instead of search exclusion.',
    },
  ];
  const structuredData = [
    renderJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: appName,
      url: absoluteUrl(siteUrl, '/'),
    }),
    renderJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: appName,
      url: absoluteUrl(siteUrl, '/'),
      email: 'security@aisecurityradar.com',
    }),
    renderJsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    }),
  ].join('\n');
  const sampleAlertCard = sampleAlert
    ? `<div class="alert-card">
          <div class="severity">${toSafeText(sampleAlert.severity)}</div>
          <div><strong><a class="alert-title-link" href="${toSafeUrl(sampleAlert.incidentUrl, siteUrl)}">${toSafeText(sampleAlert.title)}</a></strong></div>
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
  <title>${escapeHtml(`${appName} | AI Security Incident Monitoring for Security Teams`)}</title>
  ${seoSnippet}
  ${structuredData}
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
    .triple-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin-bottom: 14px;
    }
    .panel {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 16px;
    }
    .panel p:last-child,
    .panel ul:last-child,
    .panel ol:last-child { margin-bottom: 0; }
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
    .alert-title-link {
      color: #1a1815;
      text-decoration: none;
      border-bottom: 1px solid #d9d2c7;
    }
    .alert-title-link:hover,
    .alert-title-link:focus-visible {
      color: var(--accent);
      border-color: var(--accent);
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
    .register-reasons {
      margin: 12px 0;
      border: 1px solid #d9d2c7;
      background: #f7f3ea;
      padding: 10px;
    }
    .register-reasons h3 {
      margin: 0 0 8px;
      font-size: 17px;
    }
    .register-reasons .list {
      margin: 0;
      font-size: 14px;
    }
    .faq-panel dt {
      font-weight: 700;
      margin-top: 10px;
    }
    .faq-panel dd {
      margin: 4px 0 10px;
      color: var(--muted);
      font-size: 15px;
    }
    .eyebrow {
      display: inline-block;
      margin-bottom: 10px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .pill-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 12px 0 0;
    }
    .pill {
      border: 1px solid #cdb8b4;
      background: #fff;
      padding: 6px 9px;
      font-size: 13px;
    }
    .methodology-note {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--line);
      font-size: 14px;
      color: var(--muted);
    }
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
      .triple-grid { grid-template-columns: 1fr; }
      h1 { font-size: 31px; }
    }
  </style>
</head>
<body>
  <main class="wrap">
    ${renderSiteHeader(appName)}

    <section class="hero">
      <span class="eyebrow">AI Security Incident Monitoring</span>
      <h1>When AI security incidents break, <span class="risk">minutes decide the outcome.</span></h1>
      <p>AI Security Radar helps security, risk, and compliance teams detect AI-specific incidents faster, understand whether the issue truly affects their environment, and move from alert to action with cited remediation guidance.</p>
      <p class="sub">Instead of relying on generic CVE feeds or broad threat newsletters, the site focuses on AI assistants, copilots, model supply-chain risks, prompt-injection issues, AI-relevant dependencies, and public disclosures that can materially affect AI-enabled products and workflows.</p>
      <div class="hero-cta">
        <a class="btn-cta" id="hero-get-notified" data-cta="hero_get_notified" href="#waitlist-form">Get Notified</a>
        <a class="btn-ghost" href="/incidents">Browse Curated Incidents</a>
      </div>
      <div class="pill-row" aria-label="Covered topics">
        <span class="pill">Prompt Injection</span>
        <span class="pill">Model Supply Chain</span>
        <span class="pill">Copilot / Assistant Risk</span>
        <span class="pill">AI Dependency Advisories</span>
        <span class="pill">Source-Cited Response Steps</span>
      </div>
    </section>

    <section class="proof-row" aria-label="Data sources">
      <div class="proof">Monitors CISA KEV and NVD</div>
      <div class="proof">Tracks GitHub Advisories, CERT, and vendor feeds</div>
      <div class="proof">All published incidents stay in the public archive</div>
      <div class="proof">Email + Telegram delivery for fast triage</div>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>How It Works</h2>
        <p>Every incident in AI Security Radar starts as source intake, not generated filler. The workflow is designed to reduce false positives before a page or alert becomes public.</p>
        <ol class="list steps">
          <li>Collect AI-security signals from curated feeds, advisories, and public disclosures.</li>
          <li>Score AI relevance so generic software issues do not get mislabeled as AI incidents.</li>
          <li>Rewrite into operator-friendly summaries with impact, response steps, and citations.</li>
          <li>Publish each incident into a searchable archive with source links and operator-focused context.</li>
        </ol>
        <div class="methodology-note">Read the full process in <a href="/methodology">Methodology &amp; Editorial Policy</a>.</div>

        ${sampleAlertCard}
      </article>

      <form class="panel" id="waitlist-form" method="post" action="/api/waitlist">
        <h2>Request Access</h2>
        <p class="sub">Register to receive AI incident alerts with source links, practical next steps, and enough context to decide whether you need immediate containment, patching, or stakeholder notification.</p>
        <label for="email">Work Email</label>
        <input id="email" name="email" type="email" required />
        <section class="register-reasons" aria-label="Why register now">
          <h3>3 reasons teams register before an incident</h3>
          <ul class="list">
            <li><strong>Advisories are fragmented.</strong> Critical exposure data is spread across feeds like CISA KEV, NVD, GHSA, CERT, and vendor bulletins, so one missed source can hide urgent risk.</li>
            <li><strong>Public disclosure starts the attacker clock.</strong> Once incident details are public, delayed triage can extend attacker dwell time and widen potential blast radius.</li>
            <li><strong>Compliance reviews require evidence.</strong> Late awareness makes it harder to prove detection and response timelines during audits or post-incident investigations.</li>
          </ul>
        </section>

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

    <section class="triple-grid" aria-label="Audience and value">
      <article class="panel">
        <h2>Who This Is For</h2>
        <p>Mid-market security engineering, SecOps, and compliance teams that support AI-enabled products but do not have time to manually monitor fragmented advisory channels all day.</p>
      </article>
      <article class="panel">
        <h2>What Counts As AI Security</h2>
        <p>The focus is not every vulnerability on the internet. The site prioritizes AI assistants, copilots, model artifacts, prompt-layer abuse, model-serving paths, and AI-relevant dependencies that can change enterprise risk posture.</p>
      </article>
      <article class="panel">
        <h2>Why This Page Exists</h2>
        <p>The goal is to build a trustworthy AI security archive, not a thin pSEO feed. Public pages are meant to stand on their own with enough context to be genuinely useful during incident review.</p>
      </article>
    </section>

    <section class="grid">
      <article class="panel">
        <h2>What Each Alert Includes</h2>
        <ul class="list">
          <li><strong>Incident summary:</strong> what happened, when it was disclosed, and what part of the AI workflow may be exposed.</li>
          <li><strong>Why it matters:</strong> severity context, likely blast radius, and the teams that should triage first.</li>
          <li><strong>Immediate response:</strong> focused remediation steps instead of vague "review this advisory" language.</li>
          <li><strong>Source citations:</strong> direct links back to the advisory or disclosure so analysts can validate quickly.</li>
        </ul>
      </article>
      <article class="panel">
        <h2>Sources We Monitor</h2>
        <p>Coverage starts with trusted public sources such as GitHub Security Advisories, NVD, CISA KEV, CERT/EUVD feeds, and selected vendor or research feeds where AI-specific incidents are likely to surface first.</p>
        <p class="sub">Relevance and quality checks are still used to prioritize corrections and editorial improvements, but every published incident remains visible in the public archive for review.</p>
      </article>
    </section>

    <section class="panel">
      <h2>Why Teams Use AI Security Radar Instead Of Generic Threat Feeds</h2>
      <p>Generic vulnerability feeds rarely explain whether a disclosure actually matters to copilots, agent frameworks, model registries, or AI-serving infrastructure. AI Security Radar narrows the field to incidents that intersect AI operations and then adds response framing a security team can use immediately.</p>
      <ul class="list">
        <li>Focuses on AI-specific attack paths such as prompt injection, unsafe tool execution, model artifact compromise, and assistant/plugin exposure.</li>
        <li>Prioritizes decision support for security and compliance teams, not just raw advisory aggregation.</li>
        <li>Keeps published pages searchable and source-cited so teams can review the full incident record over time.</li>
      </ul>
    </section>

    <section class="panel faq-panel">
      <h2>What Is AI Security Radar?</h2>
      <p><strong>AI Security Radar monitors trusted AI-security sources and delivers source-cited alerts with response steps your team can act on quickly.</strong></p>
      <p>It is designed to answer a practical question: "Does this new public incident affect the AI tools, assistants, or model workflows we actually run, and what should we do first?"</p>
      <h3>Frequently Asked Questions</h3>
      <dl>
        <dt>What do we receive after registering?</dt>
        <dd>You receive concise incident alerts with severity context, likely impact, and recommended remediation actions.</dd>
        <dt>How is this different from generic threat feeds?</dt>
        <dd>Alerts are focused on AI-specific incidents and include direct source references so teams can validate findings fast.</dd>
        <dt>Who uses these alerts?</dt>
        <dd>Security, risk, and compliance teams use them to cut triage time and document response decisions.</dd>
        <dt>What counts as an AI-specific incident here?</dt>
        <dd>We prioritize issues tied to AI assistants, copilots, LLM workflows, prompt injection, model artifacts, and AI-relevant libraries or services rather than broad software advisories with weak AI overlap.</dd>
        <dt>Are all published incident pages indexed?</dt>
        <dd>Yes. Published incident pages stay indexable and remain in the sitemap, while editorial reviews focus on improving or correcting pages instead of hiding them from search.</dd>
        <dt>Where can I review the editorial process?</dt>
        <dd>The public selection, quality, and correction criteria are documented on the <a href="/methodology">Methodology &amp; Editorial Policy</a> page.</dd>
      </dl>
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

export function renderIncidentsPage(incidents: IncidentEntry[], meta: IncidentsPageMeta): string {
  const canonicalPath = incidentsPagePath(meta.currentPage);
  const cards =
    incidents.length > 0
      ? incidents
          .map((item) => {
            const safeTitle = toSafeText(item.title);
            const safeSummary = toSafeText(trimToSentence(item.summary, 240));
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
          .join('')
      : '<article style="border:1px solid #ddd6c8;background:#fffdf9;padding:16px;margin-bottom:12px;"><p style="margin:0;">No published incidents yet. Check back after the next verified publication.</p></article>';
  const seoSnippet = renderSeoMeta({
    title:
      meta.currentPage > 1
        ? `Recent AI Security Incidents - Page ${meta.currentPage} | AI Security Radar`
        : 'Recent AI Security Incidents | AI Security Radar',
    description:
      'Chronological AI security incidents with AI-specific context, source citations, impact summaries, and remediation guidance for security teams.',
    canonicalPath,
    siteUrl: meta.siteUrl,
    type: 'website',
  });
  const paginationLinkTags = renderPaginationLinkTags(meta.prevPagePath, meta.nextPagePath, meta.siteUrl);
  const listJsonLd = renderJsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Recent AI Security Incidents',
    url: absoluteUrl(meta.siteUrl, canonicalPath),
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: meta.totalIncidents,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      itemListElement: incidents.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.title,
        url: absoluteUrl(meta.siteUrl, `/incidents/${encodeURIComponent(item.slug)}`),
      })),
    },
  });
  const paginationNav =
    meta.totalPages > 1
      ? `<nav class="paging" aria-label="Incident pages">
        ${meta.prevPagePath ? `<a class="page-btn" href="${meta.prevPagePath}" rel="prev">Previous</a>` : '<span class="page-btn disabled" aria-disabled="true">Previous</span>'}
        <div class="page-numbers">
          ${Array.from({ length: meta.totalPages }, (_, idx) => {
            const page = idx + 1;
            const href = incidentsPagePath(page);
            if (page === meta.currentPage) {
              return `<span class="page-btn current" aria-current="page">${page}</span>`;
            }
            return `<a class="page-btn" href="${href}">${page}</a>`;
          }).join('')}
        </div>
        ${meta.nextPagePath ? `<a class="page-btn" href="${meta.nextPagePath}" rel="next">Next</a>` : '<span class="page-btn disabled" aria-disabled="true">Next</span>'}
      </nav>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${meta.currentPage > 1 ? `Recent AI Security Incidents - Page ${meta.currentPage}` : 'Recent AI Security Incidents'}</title>
  ${seoSnippet}
  ${paginationLinkTags}
  ${listJsonLd}
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
    .paging {
      margin-top: 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .page-numbers {
      display: inline-flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .page-btn {
      border: 1px solid #d9d2c7;
      background: #fff;
      color: #1c1915;
      text-decoration: none;
      padding: 6px 10px;
      font-size: 14px;
    }
    .page-btn.current {
      background: #135d7a;
      border-color: #135d7a;
      color: #fff;
      font-weight: 700;
    }
    .page-btn.disabled {
      color: #7a746b;
      background: #f0ece4;
      border-color: #ddd6c8;
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
    <a class="back" href="/">Back to homepage</a>
    <h1>Recent AI Security Incidents</h1>
    <p>This archive includes all published incident pages. Page ${meta.currentPage} of ${meta.totalPages}.</p>
    <div style="border:1px solid #ddd6c8;background:#fffdf9;padding:16px;margin-bottom:12px;">
      <p style="margin:0 0 8px;">Each page is intended to help a security team answer three questions quickly: why the issue is AI-relevant, what part of the workflow may be exposed, and what actions should happen first.</p>
      <p style="margin:0;">Selection criteria and correction policy are documented in <a href="/methodology">Methodology &amp; Editorial Policy</a>.</p>
    </div>
    ${cards}
    ${paginationNav}
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
  const assessment = assessIncidentQuality(incident);
  const analysis = classifyIncident(`${incident.sourceTitle ?? incident.title} ${incident.summary} ${incident.impact}`);
  const aiRelevanceSummary = buildAiRelevanceSummary(incident, assessment.aiSignals);
  const safeTitle = toSafeText(incident.title);
  const safeIncidentDate = toSafeText(incident.incidentDate);
  const safePublishedDate = toSafeText(incident.publishedDate);
  const safeSummary = toSafeText(incident.summary);
  const safeImpact = toSafeText(incident.impact);
  const safeAiRelevanceSummary = toSafeText(aiRelevanceSummary);
  const safeAffectedSurface = toSafeText(analysis.affectedSurface);
  const safeAttackPath = toSafeText(analysis.attackPath);
  const safeBusinessImpact = toSafeText(analysis.businessImpact);
  const safeSourceKind = toSafeText(humanizeSourceKind(incident.sourceKind));
  const safeConfidence = toSafeText(formatConfidence(incident.confidence));
  const baseSourceUrl = incident.sources[0]?.url;
  const imageUrls = extractImageUrls(`${incident.summary}\n${incident.impact}`, baseSourceUrl);
  const imageCards = imageUrls
    .map(
      (url, index) => `<img src="${escapeHtml(url)}" alt="${safeTitle} image ${index + 1}" loading="lazy" style="max-width:100%;height:auto;border:1px solid #ddd6c8;background:#fff;margin-top:8px;" />`
    )
    .join('');
  const remedies = incident.remedy.map((step) => `<li>${toSafeText(step)}</li>`).join('');
  const detectionSignals = analysis.detectionSignals.map((step) => `<li>${toSafeText(step)}</li>`).join('');
  const aiSignals = assessment.aiSignals.length > 0
    ? assessment.aiSignals.map((signal) => `<li>${toSafeText(signal)}</li>`).join('')
    : '<li>Explicit AI-specific signals are limited in the current source material, so use the cited advisory to validate scope during triage.</li>';
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
  const coverageNote = assessment.aiSignals.length > 0
    ? 'This incident is part of the public archive and includes explicit AI-related signals from the cited source material.'
    : 'This incident is part of the public archive. AI-specific signals are limited in the current source material, so source citations should be reviewed closely during triage.';
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
  const isoDate = (() => {
    const candidate = incident.sortDate ?? '';
    const parsed = Date.parse(candidate);
    if (Number.isNaN(parsed)) {
      return undefined;
    }
    return new Date(parsed).toISOString();
  })();
  const articleJsonLdObject: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: incident.title,
    description: seoDescription,
    url: incidentUrl,
    mainEntityOfPage: incidentUrl,
  };
  if (isoDate) {
    articleJsonLdObject.datePublished = isoDate;
    articleJsonLdObject.dateModified = isoDate;
  }
  const articleJsonLd = renderJsonLd(articleJsonLdObject);
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
  ${articleJsonLd}
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
    .coverage-note {
      margin: 14px 0;
      border: 1px solid #d9d2c7;
      background: #f1efe9;
      padding: 12px;
      font-size: 15px;
    }
    .detail-section {
      margin-top: 18px;
      padding-top: 14px;
      border-top: 1px solid #e3ddd1;
    }
    .detail-section h2 {
      margin: 0 0 8px;
      font-size: 22px;
    }
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
      <p class="meta">Incident date: ${safeIncidentDate} | Published: ${safePublishedDate} | Source: ${safeSourceKind} | Classification confidence: ${safeConfidence}</p>
      <div class="coverage-note">${toSafeText(coverageNote)} <a href="/methodology">Review methodology</a>.</div>
      <p>${safeSummary}</p>
      ${imageCards}
      <section class="detail-section">
        <h2>Why This Is AI-Related</h2>
        <p>${safeAiRelevanceSummary}</p>
        <ul>${aiSignals}</ul>
      </section>
      <section class="detail-section">
        <h2>Affected Workflow</h2>
        <p>${safeAffectedSurface}</p>
      </section>
      <section class="detail-section">
        <h2>Likely Attack Path</h2>
        <p>${safeAttackPath}</p>
      </section>
      <section class="detail-section">
        <h2>Impact</h2>
        <p>${safeImpact}</p>
      </section>
      <section class="detail-section">
        <h2>Detection And Triage Signals</h2>
        <ul>${detectionSignals}</ul>
      </section>
      <section class="detail-section">
        <h2>Recommended Response</h2>
        <ul>${remedies}</ul>
      </section>
      <section class="detail-section">
        <h2>Compliance And Business Impact</h2>
        <p>${safeBusinessImpact}</p>
      </section>
      <section class="detail-section">
        <h2>Sources</h2>
        <ul>${sourceLinks}</ul>
      </section>
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
      <ul>${otherItems || '<li><a href="/incidents">Browse the incident archive</a></li>'}</ul>
    </section>
    ${renderSiteFooter()}
  </main>
</body>
</html>`;
}

function renderPolicyShell(
  title: string,
  body: string,
  canonicalPath: string,
  siteUrl?: string,
  description?: string
): string {
  const safeTitle = escapeHtml(title);
  const seoSnippet = renderSeoMeta({
    title: `${title} | AI Security Radar`,
    description: description ?? `${title} for AI Security Radar.`,
    canonicalPath,
    siteUrl,
    type: 'website',
  });
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} - AI Security Radar</title>
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
      <h1>${safeTitle}</h1>
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

export function renderMethodologyPage(siteUrl?: string): string {
  return renderPolicyShell(
    'Methodology & Editorial Policy',
    `
    <p>Last updated: March 7, 2026</p>
    <p>AI Security Radar is designed to publish useful AI security pages and keep the full published archive visible. This page explains how incident selection, public publishing, and correction decisions are made.</p>
    <h2>What We Monitor</h2>
    <ul>
      <li>Trusted public advisories such as GitHub Security Advisories, NVD, CISA KEV, CERT, EUVD, and selected vendor feeds.</li>
      <li>AI-specific signals including copilots, assistants, LLM workflows, model artifacts, prompt injection, and AI-relevant dependencies.</li>
      <li>Source material that helps operators validate exposure quickly instead of relying on rewritten summaries alone.</li>
    </ul>
    <h2>What Counts As AI-Relevant</h2>
    <p>We do not intentionally label every software advisory as an AI incident. Public pages are meant to stay focused on issues that affect AI applications, assistants, models, agent workflows, or supporting components commonly used in AI delivery.</p>
    <h2>How Published Pages Are Indexed</h2>
    <ul>
      <li>Published incident pages remain indexable and stay in the sitemap.</li>
      <li>AI relevance, summary depth, and source coverage are still reviewed to prioritize editorial fixes and corrections.</li>
      <li>If a page needs improvement, it is updated, merged, or corrected rather than silently hidden from the archive.</li>
    </ul>
    <h2>How Public Incident Pages Are Written</h2>
    <p>Source material is normalized, summarized, and then structured into sections that explain likely impact, affected workflows, detection signals, and first-response actions. Where deterministic fallbacks are used, they are designed to stay practical and avoid inflated claims.</p>
    <h2>Corrections And Removals</h2>
    <p>If a page is later found to have weak AI relevance, duplicate coverage, or insufficient detail, it may be corrected, merged with newer coverage, or removed if the underlying evidence changes materially. Correction requests can be sent to security@aisecurityradar.com.</p>
    `,
    '/methodology',
    siteUrl,
    'Methodology, editorial policy, and public indexing criteria for AI Security Radar incident pages.'
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
