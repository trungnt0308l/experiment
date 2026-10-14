// Read-only source and archive checks for the incident ingestion investigation.
import { createAuditClient } from './ingestion-audit-client.mjs';
const stripHtml = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
let incomplete = false;
const inspect = createAuditClient({ onFailure: () => { incomplete = true; } });

const now = new Date();
const start = new Date(now.getTime() - 60 * 86400000);
const publicChecks = [
  ...['2026-10-09T16:00:00.000Z', '2026-10-10T16:00:00.000Z'].map((endIso) => {
    const startIso = new Date(Date.parse(endIso) - 60 * 86400000).toISOString();
    return inspect(`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=artificial%20intelligence&resultsPerPage=6&pubStartDate=${encodeURIComponent(startIso)}&pubEndDate=${encodeURIComponent(endIso)}`, (body) => {
      const data = JSON.parse(body);
      return { replayAt: endIso, totalResults: data.totalResults, records: data.vulnerabilities?.map(({ cve }) => ({ id: cve.id, published: cve.published })) };
    });
  }),
  inspect('https://aisecurityradar.com/incidents', (body) => {
    const articles = [...body.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)].map((match) => ({
      text: stripHtml(match[0]),
      urls: [...match[0].matchAll(/href="([^"]+)"/g)].map((link) => link[1]),
    }));
    return { articles, text: articles.length ? undefined : stripHtml(body).slice(-12000) };
  }),
  ...['artificial intelligence', 'llm', 'prompt injection', 'machine learning'].map((keyword) => {
    const url = new URL('https://services.nvd.nist.gov/rest/json/cves/2.0');
    url.search = new URLSearchParams({ keywordSearch: keyword, resultsPerPage: '6', pubStartDate: start.toISOString(), pubEndDate: now.toISOString() });
    return inspect(url.toString(), (body) => {
      const data = JSON.parse(body);
      return {
        totalResults: data.totalResults,
        startIndex: data.startIndex,
        resultsPerPage: data.resultsPerPage,
        records: data.vulnerabilities?.map(({ cve }) => ({ id: cve.id, published: cve.published, lastModified: cve.lastModified })),
      };
    });
  }),
  inspect('https://api.github.com/advisories?per_page=40&sort=published&direction=desc', (body) => {
    const records = JSON.parse(body);
    return { count: records.length, newest: records[0]?.published_at, oldest: records.at(-1)?.published_at };
  }),
  inspect('https://euvdservices.enisa.europa.eu/api/lastvulnerabilities', (body) => {
    const records = JSON.parse(body);
    return { count: records.length, fields: Object.keys(records[0] ?? {}), sample: { id: records[0]?.id, datePublished: records[0]?.datePublished, baseScore: records[0]?.baseScore } };
  }),
  inspect('https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=CVE-2026-60758', (body) => {
    const cve = JSON.parse(body).vulnerabilities[0].cve;
    return { id: cve.id, published: cve.published, lastModified: cve.lastModified, description: cve.descriptions?.find((item) => item.lang === 'en')?.value, cvss: cve.metrics };
  }),
  inspect('https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json', (body) => {
    const records = JSON.parse(body).vulnerabilities;
    const first80 = records.slice(0, 80);
    return { count: records.length, first80DateRange: first80.map((item) => item.dateAdded).sort().filter((_, index) => index === 0 || index === 79), newestDateAdded: records.map((item) => item.dateAdded).sort().at(-1) };
  }),
  inspect('https://raw.githubusercontent.com/cisagov/kev-data/develop/known_exploited_vulnerabilities.json', (body) => {
    const records = JSON.parse(body).vulnerabilities;
    const dates = records.slice(0, 80).map((item) => item.dateAdded).sort();
    return { count: records.length, first80DateRange: [dates[0], dates.at(-1)], newestDateAdded: records.map((item) => item.dateAdded).sort().at(-1) };
  }),
  inspect(`https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=prompt%20injection&resultsPerPage=6&startIndex=6&pubStartDate=${encodeURIComponent(start.toISOString())}&pubEndDate=${encodeURIComponent(now.toISOString())}`, (body) => {
    const data = JSON.parse(body);
    return { totalResults: data.totalResults, startIndex: data.startIndex, records: data.vulnerabilities?.map(({ cve }) => ({ id: cve.id, published: cve.published, severity: cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity, summary: cve.descriptions?.find((item) => item.lang === 'en')?.value.slice(0, 220) })) };
  }),
];
await Promise.all(publicChecks);
if (incomplete) process.exitCode = 1;
