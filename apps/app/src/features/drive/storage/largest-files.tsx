import type { DriveItem, DriveQuery } from '@smarteverything/domain';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { RankedList, type RankedEntry } from '../../../components/ranked-list';
import { useRevealed } from '../../../components/show-more';
import { bytes } from '../../../format/number';
import { flattenPages, useDriveRoots, useDriveSearch } from '../../nas/data';
import { openHrefOf, whereOf } from '../recent/recent-model';
import { StorageCardState } from './usage-bars';

export const LARGEST_QUERY: Omit<DriveQuery, 'cursor'> = {
  text: null,
  rootId: null,
  folderId: null,
  kinds: ['image', 'video', 'audio', 'document', 'other'],
  starred: null,
  duration: null,
  taken: null,
  sort: { field: 'bytes', direction: 'desc' },
};

export function largestEntriesOf(
  items: readonly DriveItem[],
  rootLabels: ReadonlyMap<string, string>,
): readonly RankedEntry[] {
  const peak = Math.max(1, ...items.map((item) => item.bytes));
  return items.map((item) => {
    const where = whereOf(item, rootLabels.get(item.rootId) ?? null);
    return {
      key: item.id,
      label: item.name,
      value: bytes(item.bytes),
      share: item.bytes / peak,
      spoken:
        where === ''
          ? `${item.name}, ${bytes(item.bytes)}`
          : `${item.name}, ${bytes(item.bytes)}, in ${where}`,
    };
  });
}

export function LargestFiles(): ReactNode {
  const query = useDriveSearch(LARGEST_QUERY, true);
  const rootLabels = new Map(useDriveRoots().map((root) => [root.id, root.label]));
  const items = flattenPages(query.data, (page) => page.items);
  const entries = largestEntriesOf(items, rootLabels);
  const { shown, more } = useRevealed(entries);
  if (query.data === undefined) {
    return (
      <StorageCardState
        title="Largest files"
        icon="hardDrive"
        query={query}
        failure="drive.storage.largest_refetch_failed"
      />
    );
  }
  if (entries.length === 0) return null;
  const byId = new Map(items.map((item) => [item.id, item]));
  return (
    <View>
      <RankedList
        title="Largest files"
        entries={shown}
        bar="info"
        onPress={(itemId) => {
          const item = byId.get(itemId);
          if (item !== undefined) router.push(openHrefOf(item));
        }}
      />
      {more}
    </View>
  );
}
