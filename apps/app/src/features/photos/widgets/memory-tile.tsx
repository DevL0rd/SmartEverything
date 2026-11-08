import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Memory } from '@smarteverything/domain';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { ThemeScope } from '../../../design/theme-scope';
import { coverFirst, useMemoryItems } from '../memories/items';
import { MemoryPicture } from '../memories/memory-picture';

export interface MemoryTileProps {
  readonly memory: Memory;
  readonly label: string;
  readonly action: string;
  readonly size: 'thumb' | 'preview';
  readonly weight: string;
  readonly editing: boolean;
  readonly onPress: () => void;
}

export function MemoryTile({
  memory,
  label,
  action,
  size,
  weight,
  editing,
  onPress,
}: MemoryTileProps): ReactNode {
  const { items } = useMemoryItems(memory.id);
  const cover = coverFirst(items, memory.coverItemId)[0] ?? null;
  return (
    <View className={cn('min-h-0 min-w-0', weight)}>
      <Interactive
        label={action}
        disabled={editing}
        onPress={onPress}
        className="flex-1 overflow-hidden rounded-md"
        layerClassName="rounded-md"
      >
        <MemoryPicture item={cover} size={size} className="absolute inset-0" />
        <ThemeScope theme="dark">
          <View
            pointerEvents="none"
            className="absolute bottom-1.5 left-1.5 mr-1.5 rounded-full bg-black/50 px-2 py-0.5"
          >
            <Text variant="caption" numberOfLines={1} className="tabular-nums">
              {label}
            </Text>
          </View>
        </ThemeScope>
      </Interactive>
    </View>
  );
}
