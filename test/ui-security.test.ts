import { describe, expect, test } from 'vitest';
import { renderIncidentDetailPage, type IncidentEntry } from '../src/ui';

describe('incident page sanitization', () => {
  test('escapes script tags and resolves relative image URLs', () => {
    const incident: IncidentEntry = {
      slug: 'unsafe-incident',
      title: 'Unsafe <script>alert(1)</script> Incident',
      incidentDate: 'February 14, 2026',
      publishedDate: 'February 14, 2026',
      summary: '<script>alert(1)</script><img src="/img/proof.png" /> Compromised system.',
      impact: 'Potential leakage ![proof](/assets/evidence.jpg)',
      remedy: ['Contain immediately'],
      sources: [{ label: 'Source', url: 'https://example.com/advisory/1' }],
    };

    const html = renderIncidentDetailPage(incident, [incident], 'https://aisecurityradar.com');

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('https://example.com/img/proof.png');
    expect(html).toContain('https://example.com/assets/evidence.jpg');
  });
});
