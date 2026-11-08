import type { DriveRoot, DriveStats } from '@smarteverything/domain';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { RankedList, type RankedEntry } from '../../../components/ranked-list';
import { useRevealed } from '../../../components/show-more';
import { bytes } from '../../../format/number';
import { itemsTextOf } from '../roots/root-card-model';

type StatsRoot = DriveStats['roots'][number];

export function rootEntriesOf(
  stats: DriveStats,
  roots: readonly DriveRoot[],
): readonly RankedEntry[] {
  const labels = new Map(roots.map((root) => [root.id, root.label]));
  const named = stats.roots.flatMap(
    (entry): readonly (StatsRoot & { readonly label: string })[] => {
      const label = labels.get(entry.rootId);
      return label === undefined ? [] : [{ ...entry, label }];
    },
  );
  const peak = Math.max(1, ...named.map((entry) => entry.bytes));
  return [...named]
    .sort((a, b) => b.bytes - a.bytes)
    .map((entry) => ({
      key: entry.rootId,
      label: entry.label,
      value: bytes(entry.bytes),
      share: entry.bytes / peak,
      spoken: `${entry.label}, ${bytes(entry.bytes)}, ${itemsTextOf(entry.items)}`,
    }));
}

export interface ByRootProps {
  readonly stats: DriveStats;
  readonly roots: readonly DriveRoot[];
}

export function ByRoot({ stats, roots }: ByRootProps): ReactNode {
  const entries = rootEntriesOf(stats, roots);
  const { shown, more } = useRevealed(entries);
  if (entries.length === 0) return null;
  return (
    <View>
      <RankedList
        title="By library folder"
        entries={shown}
        bar="info"
        onPress={(rootId) => {
          router.push(href.driveRoot(rootId));
        }}
      />
      {more}
    </View>
  );
}
