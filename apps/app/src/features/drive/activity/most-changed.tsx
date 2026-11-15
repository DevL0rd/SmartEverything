import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { RankedList, type RankedEntry } from '../../../components/ranked-list';
import { useRevealed } from '../../../components/show-more';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { plural } from '../../../format/text';
import type { FolderCount } from './via-model';

export interface MostChangedProps {
  readonly folders: readonly FolderCount[];
  readonly onOpen: (folder: FolderCount) => void;
  readonly card: boolean;
}

export const MOST_CHANGED_TITLE = 'Most changed folders';

export function rankedOf(folders: readonly FolderCount[]): RankedEntry[] {
  const peak = Math.max(1, ...folders.map((folder) => folder.count));
  return folders.map((folder) => ({
    key: folder.key,
    label: folder.label,
    value: count(folder.count),
    share: folder.count / peak,
    spoken: `${folder.label}, ${plural(folder.count, 'change')}`,
  }));
}

export function MostChanged({ folders, onOpen, card }: MostChangedProps): ReactNode {
  const { shown, more } = useRevealed(folders);
  if (folders.length === 0) return null;
  const byKey = new Map(folders.map((folder) => [folder.key, folder]));
  const open = (key: string): void => {
    const folder = byKey.get(key);
    if (folder !== undefined) onOpen(folder);
  };
  if (card) {
    return (
      <Card>
        <Text variant="footnote" tone="variant" accessibilityRole="header">
          {MOST_CHANGED_TITLE}
        </Text>
        <RankedList inCard entries={rankedOf(shown)} bar="info" onPress={open} />
        {more}
      </Card>
    );
  }
  return (
    <View>
      <RankedList title={MOST_CHANGED_TITLE} entries={rankedOf(shown)} bar="info" onPress={open} />
      {more}
    </View>
  );
}
