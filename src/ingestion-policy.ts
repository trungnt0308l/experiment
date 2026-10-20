import type { SourceHealth } from './ingestion-runtime';
import { isSourceBudgetMessage } from './ingestion-network';

const SOURCE_STALE_MS = 6 * 3600000;
const TRANSIENT_GRACE_MS = 3 * 3600000;

export function actionableSourceErrors(health: Partial<SourceHealth>): string[] {
  if (health.queries) return Object.values(health.queries).flatMap(actionableSourceErrors);
  const errors = (health.errors ?? []).filter((error) => !isSourceBudgetMessage(error));
  const credentials = (health.warnings ?? []).filter((warning) => /token rejected|rotate the source token/i.test(warning));
  const immediate = errors.filter((error) => /HTTP (?:400|401|403|404|422|429)\b|invalid |corrupt /i.test(error));
  const sustained = health.failureStreak === undefined || health.failureStreak >= 3
    || Boolean(health.firstFailureAt && Date.now() - Date.parse(health.firstFailureAt) >= TRANSIENT_GRACE_MS);
  return [...credentials, ...(sustained ? errors : immediate)];
}

export function sourceIsStale(health: Partial<SourceHealth>): boolean {
  if (health.queries) return Object.values(health.queries).some(sourceIsStale);
  const baseline = health.lastSuccessAt ?? health.firstFailureAt ?? health.lastAttemptAt;
  return Boolean(baseline && Date.now() - Date.parse(baseline) >= SOURCE_STALE_MS);
}

export function alertIdentity(issue: string): string {
  const normalized = issue.replace(/^NVD keyword "[^"]+":/, 'nvd:')
    .replace(/^\d+ oversized ingestion records/, 'oversized ingestion records');
  const source = normalized.match(/^(nvd|ghsa|cisa_kev|euvd|rss(?: \([^)]+\))?|hn):/i)?.[1];
  if (source) return `${source.toLowerCase()}:${/HTTP (?:400|401|403|404|422)\b|invalid /i.test(normalized) ? 'configuration' : 'unavailable'}`;
  return normalized;
}
