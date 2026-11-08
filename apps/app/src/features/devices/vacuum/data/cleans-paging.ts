import type { VacuumCleanSummary } from '@smarteverything/domain';

export const CLEANS_PAGE_SIZE = 30;

export function nextCleansCursor(page: readonly VacuumCleanSummary[]): string | undefined {
  return page.length < CLEANS_PAGE_SIZE ? undefined : page[page.length - 1]?.startedAt;
}

export function needsOlderCleans(
  cleans: readonly VacuumCleanSummary[],
  fromMs: number,
  more: boolean,
): boolean {
  const oldest = cleans[cleans.length - 1];
  return more && (oldest === undefined || Date.parse(oldest.startedAt) > fromMs);
}
