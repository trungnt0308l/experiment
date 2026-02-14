import { describe, expect, test } from 'vitest';
import {
  computePageQualityGate,
  detectDuplicateMetadata,
  findRoleProblemPage,
  listRoleProblemPages,
  type RoleProblemPageDefinition,
} from '../src/pseo';

describe('pseo registry', () => {
  test('generates exactly 24 role-problem pages with unique paths', () => {
    const pages = listRoleProblemPages();
    expect(pages).toHaveLength(24);
    const uniquePaths = new Set(pages.map((item) => item.path));
    expect(uniquePaths.size).toBe(24);
  });

  test('resolves valid role/problem slug and rejects invalid combination', () => {
    const match = findRoleProblemPage('ciso', 'prompt-injection-risk');
    expect(match).not.toBeNull();
    expect(match?.path).toBe('/for/ciso/prompt-injection-risk');

    const invalid = findRoleProblemPage('ciso', 'not-a-problem');
    expect(invalid).toBeNull();
  });

  test('passes quality gate for generated page definitions', () => {
    const page = findRoleProblemPage('ceo', 'ai-data-leakage');
    expect(page).not.toBeNull();
    const gate = computePageQualityGate(page as RoleProblemPageDefinition, listRoleProblemPages());
    expect(gate.indexable).toBe(true);
    expect(gate.metrics.bodyWordCount).toBeGreaterThanOrEqual(650);
  });

  test('fails quality gate for thin custom page', () => {
    const base = findRoleProblemPage('it-lead', 'shadow-ai-usage') as RoleProblemPageDefinition;
    const thin: RoleProblemPageDefinition = {
      ...base,
      title: 'Thin title',
      metaDescription: 'Thin description',
      intro: 'Too short.',
      roleBullets: ['One'],
      checklist: ['One'],
      faqs: [{ question: 'Q', answer: 'A' }],
      bodySections: [{ heading: 'Short', paragraphs: ['tiny'] }],
    };

    const gate = computePageQualityGate(thin, [thin]);
    expect(gate.indexable).toBe(false);
    expect(gate.reasons.length).toBeGreaterThan(0);
  });

  test('detects duplicate metadata collisions', () => {
    const pages = listRoleProblemPages();
    const first = pages[0] as RoleProblemPageDefinition;
    const second = { ...pages[1], title: first.title, metaDescription: first.metaDescription } as RoleProblemPageDefinition;
    const report = detectDuplicateMetadata([first, second]);
    expect(report.duplicateTitles).toContain(first.title);
    expect(report.duplicateDescriptions).toContain(first.metaDescription);
  });
});
