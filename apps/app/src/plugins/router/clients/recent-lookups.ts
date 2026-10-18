import type { AdGuardQuery } from '@smarteverything/domain';

const SHOWN = 5;

export function recentLookups(
  entries: readonly AdGuardQuery[],
  address: string,
): readonly AdGuardQuery[] {
  return entries.filter((query) => query.client === address).slice(0, SHOWN);
}

export function lookupCaption(loaded: boolean, count: number): string | undefined {
  if (!loaded) {
    return undefined;
  }
  return count === 0 ? 'None yet' : `Last ${String(count)}`;
}
