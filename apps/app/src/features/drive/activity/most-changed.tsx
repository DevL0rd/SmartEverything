import type { ReactNode } from 'react';
import { View } from 'react-native';
import { RankedList, type RankedEntry } from '../../../components/ranked-list';
import { useRevealed } from '../../../components/show-more';
import { count } from '../../../format/number';
import { plural } from '../../../format/text';
import type { FolderCount } from './via-model';

export interface MostChangedProps {
  readonly folders: readonly FolderCount[];
  readonly onOpen: (folder: FolderCount) => void;
}

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

export function MostChanged({ folders, onOpen }: MostChangedProps): ReactNode {
  const { shown, more } = useRevealed(folders);
  if (folders.length === 0) return null;
  const byKey = new Map(folders.map((folder) => [folder.key, folder]));
  return (
    <View>
      <RankedList
        title="Most changed folders"
        entries={rankedOf(shown)}
        bar="info"
        onPress={(key) => {
          const folder = byKey.get(key);
          if (folder !== undefined) onOpen(folder);
        }}
      />
      {more}
    </View>
  );
}
