export const ROLE_SLUGS = ['ciso', 'ceo', 'it-lead', 'smb-owner'] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

export const PROBLEM_SLUGS = [
  'prompt-injection-risk',
  'ai-data-leakage',
  'shadow-ai-usage',
  'model-supply-chain-risk',
  'ai-compliance-exposure',
  'agent-privilege-misuse',
] as const;
export type ProblemSlug = (typeof PROBLEM_SLUGS)[number];

export type RoleProblemFaq = {
  question: string;
  answer: string;
};

export type RoleProblemSection = {
  heading: string;
  paragraphs: string[];
};

export type RoleProblemPageDefinition = {
  roleSlug: RoleSlug;
  problemSlug: ProblemSlug;
  roleLabel: string;
  problemLabel: string;
  path: string;
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  roleBullets: string[];
  checklist: string[];
  faqs: RoleProblemFaq[];
  bodySections: RoleProblemSection[];
  keywordSignals: string[];
};

export type RoleProblemIncidentSummary = {
  slug: string;
  title: string;
  summary: string;
};

export type QualityGateResult = {
  indexable: boolean;
  reasons: string[];
  metrics: {
    bodyWordCount: number;
    roleBulletCount: number;
    checklistCount: number;
    faqCount: number;
    internalLinkCount: number;
  };
};

export type RoleProblemPageViewModel = {
  page: RoleProblemPageDefinition;
  relatedByRole: RoleProblemPageDefinition[];
  relatedByProblem: RoleProblemPageDefinition[];
  relatedIncidents: RoleProblemIncidentSummary[];
  qualityGate: QualityGateResult;
  noindex: boolean;
  sourceTag: string;
};

type RoleProfile = {
  slug: RoleSlug;
  label: string;
  goal: string;
  urgencyLens: string;
  ownershipLine: string;
  bullets: string[];
};

type ProblemProfile = {
  slug: ProblemSlug;
  label: string;
  shortLabel: string;
  leadLine: string;
  impactLine: string;
  checklist: string[];
  faqs: Array<{ questionTemplate: string; answerTemplate: string }>;
  keywordSignals: string[];
};

const ROLE_PROFILES: RoleProfile[] = [
  {
    slug: 'ciso',
    label: 'CISO',
    goal: 'reduce incident exposure while keeping response accountability clear across security, IT, and legal teams',
    urgencyLens: 'board-level risk and downstream operational impact',
    ownershipLine: 'owns strategic risk posture and executive reporting',
    bullets: [
      'Prioritize incidents by business impact and probable blast radius, not by feed volume alone.',
      'Align AI-specific response controls with existing incident command and governance routines.',
      'Maintain a traceable chain of evidence for regulator, customer, and board communication.',
      'Use one shared operating view so security, IT, and legal teams execute against the same facts.',
    ],
  },
  {
    slug: 'ceo',
    label: 'CEO',
    goal: 'protect revenue confidence and avoid surprise operational or reputational escalations from AI exposure',
    urgencyLens: 'business continuity, customer trust, and strategic execution risk',
    ownershipLine: 'sets risk appetite, funding priorities, and cross-functional escalation thresholds',
    bullets: [
      'Convert technical AI incidents into clear business-impact language for decisive leadership action.',
      'Set expectations for fast triage and explicit ownership before incidents become external narratives.',
      'Use concrete exposure summaries to prioritize investments in security controls and staffing.',
      'Track risk trends over time so executive decisions are based on evidence instead of anecdotes.',
    ],
  },
  {
    slug: 'it-lead',
    label: 'IT Lead',
    goal: 'operationalize fast containment and remediation without disrupting critical internal workflows',
    urgencyLens: 'execution speed, system reliability, and implementation burden',
    ownershipLine: 'owns day-to-day technical execution across identity, endpoint, and infrastructure controls',
    bullets: [
      'Translate alerts into concrete tasks for IAM, endpoint, SaaS admin, and network teams.',
      'Use repeatable runbooks so escalation quality is consistent across shifts and responders.',
      'Reduce mean time to containment by standardizing detection-to-action handoffs.',
      'Document remediation evidence in a way that supports both audits and engineering retrospectives.',
    ],
  },
  {
    slug: 'smb-owner',
    label: 'SMB Owner',
    goal: 'reduce AI security risk with lean resources while maintaining customer confidence and delivery velocity',
    urgencyLens: 'limited team capacity, financial downside, and compliance pressure',
    ownershipLine: 'owns business outcomes while balancing security spend against growth priorities',
    bullets: [
      'Focus limited effort on the highest-impact AI risks that can materially affect revenue and trust.',
      'Use concise action checklists that can be executed without a large dedicated security team.',
      'Build simple evidence trails that satisfy partner due diligence and lightweight compliance asks.',
      'Avoid alert fatigue by routing only relevant incidents tied to real exposure in your stack.',
    ],
  },
];

const PROBLEM_PROFILES: ProblemProfile[] = [
  {
    slug: 'prompt-injection-risk',
    label: 'Prompt Injection Risk Monitoring',
    shortLabel: 'prompt injection risk',
    leadLine:
      'Prompt injection incidents can convert ordinary user input into privilege escalation, data exfiltration, or unauthorized actions inside AI-enabled workflows.',
    impactLine:
      'Detection must focus on model behavior anomalies, tool invocation paths, and cross-system trust boundaries to prevent hidden abuse chains.',
    checklist: [
      'Catalog AI features that execute external tools, queries, or workflow actions based on model output.',
      'Enforce allowlist constraints for model-triggered actions and sanitize high-risk prompt channels.',
      'Instrument logs to capture prompt context, model responses, and downstream action traces.',
      'Define containment steps for suspected prompt injection attempts across production integrations.',
      'Review high-risk prompts and mitigation effectiveness in weekly security governance cadence.',
    ],
    faqs: [
      {
        questionTemplate: 'How often should {role} teams reassess prompt injection exposure?',
        answerTemplate:
          '{role} teams should reassess continuously for critical surfaces and formally review exposure at least weekly, with immediate reassessment after any model, integration, or permission change.',
      },
      {
        questionTemplate: 'What evidence is most useful during prompt injection investigations?',
        answerTemplate:
          'The most useful evidence combines the exact prompt chain, tool invocation history, permission context, and timing correlation across affected systems.',
      },
      {
        questionTemplate: 'Can prompt injection be managed without disabling AI features?',
        answerTemplate:
          'Yes. Risk can be materially reduced through scoped permissions, guardrail enforcement, monitored execution paths, and fast rollback procedures.',
      },
    ],
    keywordSignals: ['prompt injection', 'jailbreak', 'tool misuse', 'indirect prompt', 'model override'],
  },
  {
    slug: 'ai-data-leakage',
    label: 'AI Data Leakage Monitoring',
    shortLabel: 'AI data leakage risk',
    leadLine:
      'AI data leakage incidents often begin with convenience workflows where sensitive business context is copied into external models without policy-aware controls.',
    impactLine:
      'The practical challenge is not only prevention, but proving what data moved, where it moved, and whether retention policies were violated.',
    checklist: [
      'Map sensitive data classes most likely to enter AI prompts and generated outputs.',
      'Set clear policy rules for approved AI tools, usage boundaries, and retention expectations.',
      'Enable telemetry for prompt payload categories and downstream sharing events.',
      'Create immediate revocation and containment steps for suspected AI data exposure.',
      'Document incidents with evidence quality sufficient for customer and regulator review.',
    ],
    faqs: [
      {
        questionTemplate: 'What is the first control {role} teams should implement for AI data leakage?',
        answerTemplate:
          '{role} teams should begin with clear data classification boundaries and approved-tool policies, then enforce those policies with telemetry and response runbooks.',
      },
      {
        questionTemplate: 'How do teams prove whether sensitive data was exposed through AI tools?',
        answerTemplate:
          'Teams need correlated logs for prompt classes, user identity, access path, and destination context, backed by retention and access evidence.',
      },
      {
        questionTemplate: 'How quickly should AI data leakage alerts be triaged?',
        answerTemplate:
          'High-confidence leakage alerts should be triaged immediately because containment speed strongly influences legal exposure and customer impact.',
      },
    ],
    keywordSignals: ['data leak', 'data leakage', 'sensitive data', 'pii', 'exfiltration', 'prompt data'],
  },
  {
    slug: 'shadow-ai-usage',
    label: 'Shadow AI Usage Monitoring',
    shortLabel: 'shadow AI usage risk',
    leadLine:
      'Shadow AI usage grows when teams adopt unsanctioned tools to move faster, creating blind spots in governance, identity, and data handling.',
    impactLine:
      'Security outcomes improve when discovery, policy guidance, and remediation happen together instead of relying on one-time enforcement pushes.',
    checklist: [
      'Inventory unsanctioned AI tools discovered via network, browser, and SaaS telemetry.',
      'Define approved alternatives and publish clear policy guidance for high-risk workflows.',
      'Implement lightweight detection rules for unsanctioned usage patterns and new tool adoption.',
      'Route violations to role-based owners with practical, time-bound remediation actions.',
      'Review trend metrics monthly to reduce repeat policy exceptions and unmanaged tooling.',
    ],
    faqs: [
      {
        questionTemplate: 'Why does shadow AI usage persist even after policy announcements?',
        answerTemplate:
          'It persists when policy is not paired with usable alternatives, ongoing detection, and operational accountability for remediation.',
      },
      {
        questionTemplate: 'What should {role} teams track to reduce shadow AI exposure?',
        answerTemplate:
          '{role} teams should track new unsanctioned tools, repeat usage by business unit, policy exception patterns, and remediation completion rates.',
      },
      {
        questionTemplate: 'How can organizations reduce shadow AI risk without blocking innovation?',
        answerTemplate:
          'Organizations should provide approved AI pathways, publish clear guardrails, and monitor exceptions so teams can move fast within defined limits.',
      },
    ],
    keywordSignals: ['shadow ai', 'unsanctioned ai', 'unauthorized ai', 'policy violation', 'unknown ai tool'],
  },
  {
    slug: 'model-supply-chain-risk',
    label: 'Model Supply Chain Risk Monitoring',
    shortLabel: 'model supply chain risk',
    leadLine:
      'Model supply chain incidents can originate from upstream dependencies, unverified model artifacts, and integration assumptions that bypass trust controls.',
    impactLine:
      'Effective monitoring requires tracking provenance, dependency changes, and exploit disclosures that affect model serving or orchestration layers.',
    checklist: [
      'Track model provenance, dependency versions, and integrity checks for deployed AI components.',
      'Define approval gates for introducing new model providers, plugins, or orchestration libraries.',
      'Monitor advisory feeds for supply chain CVEs tied to your model execution stack.',
      'Prepare rollback and isolation procedures for compromised or untrusted AI dependencies.',
      'Audit change logs to verify that emergency fixes are fully propagated across environments.',
    ],
    faqs: [
      {
        questionTemplate: 'Which supply chain signals matter most for {role} teams?',
        answerTemplate:
          'High-priority signals include dependency vulnerabilities, compromised artifacts, revoked trust attestations, and exploitable integration paths.',
      },
      {
        questionTemplate: 'How should teams respond when a model dependency is compromised?',
        answerTemplate:
          'Teams should isolate affected services, deploy rollback or patched dependencies, and document exposure windows with clear owner assignments.',
      },
      {
        questionTemplate: 'Is monthly dependency review enough for AI supply chain risk?',
        answerTemplate:
          'Monthly review alone is usually insufficient. Continuous monitoring plus event-driven escalation is required for timely containment.',
      },
    ],
    keywordSignals: ['supply chain', 'dependency', 'model artifact', 'tampering', 'upstream compromise', 'plugin vulnerability'],
  },
  {
    slug: 'ai-compliance-exposure',
    label: 'AI Compliance Exposure Monitoring',
    shortLabel: 'AI compliance exposure',
    leadLine:
      'AI compliance exposure appears when policy, control evidence, and operational behavior drift apart under rapid product and tooling changes.',
    impactLine:
      'Organizations need continuous visibility into incidents that can trigger reporting duties, audit findings, or contractual compliance failures.',
    checklist: [
      'Map compliance obligations to concrete AI controls and measurable evidence artifacts.',
      'Monitor incidents that indicate policy-control drift or unapproved data handling paths.',
      'Define escalation criteria for legal, privacy, and customer-notification stakeholders.',
      'Capture remediation timelines and ownership to support defensible audit narratives.',
      'Review recurring exposure themes and update policy language with implementation guidance.',
    ],
    faqs: [
      {
        questionTemplate: 'What compliance evidence should {role} teams capture first?',
        answerTemplate:
          '{role} teams should capture incident timelines, impacted assets, applied controls, and remediation decisions tied to accountable owners.',
      },
      {
        questionTemplate: 'How do AI incidents become compliance events?',
        answerTemplate:
          'They become compliance events when they affect regulated data, breach policy commitments, or trigger contractual disclosure requirements.',
      },
      {
        questionTemplate: 'Can compliance exposure be reduced without adding heavy manual process?',
        answerTemplate:
          'Yes. Structured alerting, consistent evidence capture, and predefined escalation playbooks reduce manual overhead while improving control assurance.',
      },
    ],
    keywordSignals: ['compliance', 'regulatory', 'audit', 'policy breach', 'governance', 'evidence'],
  },
  {
    slug: 'agent-privilege-misuse',
    label: 'Agent Privilege Misuse Monitoring',
    shortLabel: 'agent privilege misuse risk',
    leadLine:
      'Agent privilege misuse can occur when autonomous workflows receive broad permissions and operate without clear, enforceable boundaries.',
    impactLine:
      'Monitoring must connect identity scope, action logs, and anomaly context to catch abuse before high-impact operations are executed.',
    checklist: [
      'Inventory AI agents and map each agent to explicit permission scopes and owner teams.',
      'Enforce least-privilege defaults for agent tokens, service accounts, and workflow connectors.',
      'Monitor agent action logs for high-risk commands, privilege escalation, and abnormal frequency.',
      'Define emergency disable controls for compromised or misbehaving agent paths.',
      'Run recurring access reviews to remove stale privileges and overbroad execution rights.',
    ],
    faqs: [
      {
        questionTemplate: 'How should {role} teams prioritize agent misuse alerts?',
        answerTemplate:
          '{role} teams should prioritize alerts by permission level, asset sensitivity, and whether autonomous actions can alter critical systems.',
      },
      {
        questionTemplate: 'What controls reduce the blast radius of agent privilege misuse?',
        answerTemplate:
          'Least privilege, scoped credentials, workflow approvals for high-risk actions, and rapid kill-switch controls reduce blast radius materially.',
      },
      {
        questionTemplate: 'Do agent misuse incidents require a different response model than user misuse?',
        answerTemplate:
          'Yes. Agent incidents often execute faster and across more systems, so response playbooks must emphasize immediate containment and scope verification.',
      },
    ],
    keywordSignals: ['agent abuse', 'privilege misuse', 'agent permissions', 'overprivileged', 'autonomous action', 'service account'],
  },
];

function formatProblemNoun(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function fillTemplate(template: string, roleLabel: string): string {
  return template.replaceAll('{role}', roleLabel);
}

function buildBodySections(role: RoleProfile, problem: ProblemProfile): RoleProblemSection[] {
  const problemNoun = formatProblemNoun(problem.shortLabel);

  return [
    {
      heading: `Why ${problemNoun} is operationally significant for ${role.label}`,
      paragraphs: [
        `${role.label} teams are accountable for ${role.goal}, but ${problemNoun} often spreads across product, security, and vendor boundaries before anyone has a full picture. ${problem.leadLine} In practice, this means organizations can miss the early-warning window where a targeted response prevents escalation. A role-focused monitoring surface helps teams move from fragmented updates to one coherent operating narrative that ties incident context, probable exposure, and immediate next actions together in a way decision-makers can execute quickly.`,
        `Most organizations already collect large volumes of alerts, yet execution gaps still appear because signal quality and ownership clarity are inconsistent. For ${role.label}, the critical challenge is connecting telemetry to decisions under time pressure while preserving evidence quality. ${problem.impactLine} When incident data is normalized into role-ready language, teams can coordinate faster, document actions with confidence, and avoid the delays that typically come from translating raw feed output into practical business response steps.`,
      ],
    },
    {
      heading: `Decision model for ${role.label} when incidents break`,
      paragraphs: [
        `A usable decision model starts with scope, urgency, and owner assignment. ${role.label} leadership needs to know what changed, what systems are exposed, and what action path reduces risk fastest without creating avoidable disruption. ${role.ownershipLine} By framing incidents around impact windows and containment options, teams can avoid overreacting to noise while still escalating credible threats early enough to prevent secondary failures in adjacent processes and integrations.`,
        `Response quality improves when tactical execution is tied directly to strategic intent. Teams should treat incident handling as a sequence: confirm signal credibility, estimate exposure, assign owners, and enforce time-bound containment steps. This structure keeps communication crisp for executives, operators, and auditors. It also reduces confusion during multi-team response, because every action is linked to an explicit rationale and measurable outcome rather than ad-hoc judgment in the middle of an already volatile event.`,
      ],
    },
    {
      heading: `How role-specific monitoring reduces avoidable risk`,
      paragraphs: [
        `Role-specific monitoring is valuable because it converts technical findings into responsibilities that align with existing governance patterns. For ${role.label}, this means fewer ambiguous handoffs and faster confirmation of whether a newly reported issue affects live workflows. Teams can then prioritize scarce attention on incidents that match real exposure, not just headlines. This approach improves reliability of triage metrics and keeps leadership updates anchored to current facts instead of speculative assumptions.`,
        `A strong monitoring approach also improves audit readiness over time. When incident summaries include source citations, triage rationale, and remediation checkpoints, post-incident reviews become more actionable and less performative. That feedback loop helps ${role.label} teams tune thresholds, refine runbooks, and establish repeatable evidence standards. The result is better resilience in future incidents, because teams are not relearning the same lessons every time a new threat pattern appears in external advisories or ecosystem channels.`,
      ],
    },
    {
      heading: `Execution outcomes to track over the next quarter`,
      paragraphs: [
        `To verify impact, ${role.label} teams should track whether incident awareness leads to faster containment and clearer communication quality. Useful indicators include time to first owner assignment, time to containment recommendation, and completeness of evidence capture across incidents tied to ${problemNoun}. These metrics expose where process friction still exists and where tooling improvements create measurable reduction in operational risk, regulatory stress, and customer-impact uncertainty.`,
        `Over a quarter, the goal is to move from reactive firefighting to predictable execution. When monitoring, role ownership, and remediation checklists are aligned, teams can maintain momentum even under sustained threat volume. This is especially important as AI adoption expands, because threat surfaces and dependency complexity will continue to grow. A disciplined role-first model gives ${role.label} leaders a repeatable way to convert incident intelligence into prioritized action and defensible governance outcomes.`,
      ],
    },
  ];
}

function toPageDefinition(role: RoleProfile, problem: ProblemProfile): RoleProblemPageDefinition {
  const path = `/for/${role.slug}/${problem.slug}`;
  const title = `${problem.label} for ${role.label} Teams | AI Security Radar`;
  const metaDescription = `Role-specific guidance for ${role.label} teams to reduce ${problem.shortLabel} through source-backed alerts, triage checklists, and evidence-ready response workflows.`;
  const h1 = `${problem.label} for ${role.label}`;
  const intro = `${problem.leadLine} This page is designed for ${role.label} teams that need faster detection, clearer ownership, and measurable risk reduction outcomes.`;
  const faqs: RoleProblemFaq[] = problem.faqs.map((entry) => ({
    question: fillTemplate(entry.questionTemplate, role.label),
    answer: fillTemplate(entry.answerTemplate, role.label),
  }));

  return {
    roleSlug: role.slug,
    problemSlug: problem.slug,
    roleLabel: role.label,
    problemLabel: problem.label,
    path,
    title,
    metaDescription,
    h1,
    intro,
    roleBullets: [...role.bullets],
    checklist: [...problem.checklist],
    faqs,
    bodySections: buildBodySections(role, problem),
    keywordSignals: [...problem.keywordSignals],
  };
}

const ALL_ROLE_PROBLEM_PAGES: RoleProblemPageDefinition[] = ROLE_PROFILES.flatMap((role) =>
  PROBLEM_PROFILES.map((problem) => toPageDefinition(role, problem))
);

function toCountMap(values: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const value of values) {
    out.set(value, (out.get(value) ?? 0) + 1);
  }
  return out;
}

function countWords(value: string): number {
  return value
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0).length;
}

function pageBodyWordCount(page: RoleProblemPageDefinition): number {
  const sectionText = page.bodySections
    .map((section) => `${section.heading} ${section.paragraphs.join(' ')}`)
    .join(' ');
  const faqText = page.faqs.map((faq) => `${faq.question} ${faq.answer}`).join(' ');
  return countWords(`${page.intro} ${sectionText} ${page.roleBullets.join(' ')} ${page.checklist.join(' ')} ${faqText}`);
}

export function isRoleSlug(value: string): value is RoleSlug {
  return ROLE_SLUGS.includes(value as RoleSlug);
}

export function isProblemSlug(value: string): value is ProblemSlug {
  return PROBLEM_SLUGS.includes(value as ProblemSlug);
}

export function listRoleProblemPages(): RoleProblemPageDefinition[] {
  return [...ALL_ROLE_PROBLEM_PAGES];
}

export function findRoleProblemPage(role: string, problem: string): RoleProblemPageDefinition | null {
  if (!isRoleSlug(role) || !isProblemSlug(problem)) {
    return null;
  }
  return ALL_ROLE_PROBLEM_PAGES.find((item) => item.roleSlug === role && item.problemSlug === problem) ?? null;
}

export function getRelatedPagesByRole(role: RoleSlug, currentProblem?: ProblemSlug, limit = 5): RoleProblemPageDefinition[] {
  return ALL_ROLE_PROBLEM_PAGES
    .filter((item) => item.roleSlug === role && (!currentProblem || item.problemSlug !== currentProblem))
    .slice(0, limit);
}

export function getRelatedPagesByProblem(problem: ProblemSlug, currentRole?: RoleSlug, limit = 5): RoleProblemPageDefinition[] {
  return ALL_ROLE_PROBLEM_PAGES
    .filter((item) => item.problemSlug === problem && (!currentRole || item.roleSlug !== currentRole))
    .slice(0, limit);
}

export function detectDuplicateMetadata(definitions: ReadonlyArray<RoleProblemPageDefinition>): {
  duplicateTitles: string[];
  duplicateDescriptions: string[];
} {
  const titleCounts = toCountMap(definitions.map((item) => item.title));
  const descCounts = toCountMap(definitions.map((item) => item.metaDescription));

  const duplicateTitles = Array.from(titleCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value);

  const duplicateDescriptions = Array.from(descCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([value]) => value);

  return { duplicateTitles, duplicateDescriptions };
}

export function computePageQualityGate(
  definition: RoleProblemPageDefinition,
  allDefinitions: ReadonlyArray<RoleProblemPageDefinition> = ALL_ROLE_PROBLEM_PAGES
): QualityGateResult {
  const reasons: string[] = [];
  const bodyWordCount = pageBodyWordCount(definition);
  const roleBulletCount = definition.roleBullets.length;
  const checklistCount = definition.checklist.length;
  const faqCount = definition.faqs.length;
  const internalLinkCount =
    1 +
    getRelatedPagesByRole(definition.roleSlug, definition.problemSlug, 8).length +
    getRelatedPagesByProblem(definition.problemSlug, definition.roleSlug, 8).length;

  if (bodyWordCount < 650) {
    reasons.push(`Body content below minimum word count: ${bodyWordCount}/650`);
  }
  if (roleBulletCount < 4) {
    reasons.push(`Role bullet count below minimum: ${roleBulletCount}/4`);
  }
  if (checklistCount < 5) {
    reasons.push(`Checklist item count below minimum: ${checklistCount}/5`);
  }
  if (faqCount < 3) {
    reasons.push(`FAQ count below minimum: ${faqCount}/3`);
  }
  if (internalLinkCount < 5) {
    reasons.push(`Internal link count below minimum: ${internalLinkCount}/5`);
  }

  const duplicateMeta = detectDuplicateMetadata(allDefinitions);
  if (duplicateMeta.duplicateTitles.includes(definition.title)) {
    reasons.push('Duplicate meta title detected');
  }
  if (duplicateMeta.duplicateDescriptions.includes(definition.metaDescription)) {
    reasons.push('Duplicate meta description detected');
  }

  return {
    indexable: reasons.length === 0,
    reasons,
    metrics: {
      bodyWordCount,
      roleBulletCount,
      checklistCount,
      faqCount,
      internalLinkCount,
    },
  };
}

export function pseoSourceTag(roleSlug: RoleSlug, problemSlug: ProblemSlug): string {
  return `pseo-role-${roleSlug}-${problemSlug}`;
}
