import type { AdGuardTopEntry } from '@smarteverything/domain';
import type { RankedEntry } from '../../../components/ranked-list';
import { sharesOf } from '../../../components/ranked-share';
import { count } from '../../../format/number';

export function rankedEntries(
  entries: readonly AdGuardTopEntry[],
  limit: number,
  noun: string,
): readonly RankedEntry[] {
  const shown = entries.slice(0, limit);
  const shares = sharesOf(shown.map((entry) => entry.count));
  return shown.map((entry, index) => ({
    key: entry.name,
    label: entry.name,
    value: count(entry.count),
    share: shares[index] ?? 0,
    spoken: `${entry.name}, ${count(entry.count)} ${noun}`,
  }));
}
