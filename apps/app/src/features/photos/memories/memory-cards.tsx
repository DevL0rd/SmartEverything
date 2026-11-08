import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Memory } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { HScroller } from '../../../components/h-scroller';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { coverFirst, useMemoryItems, type MemoryMedia } from './items';
import { MemoryPicture } from './memory-picture';
import { cardLine, memoryTitle, weekMark, type WeekMemory } from './model';
import { PhotoMark } from './photo-mark';

function useCovers(memory: Memory): readonly MemoryMedia[] {
  const { items } = useMemoryItems(memory.id);
  return coverFirst(items, memory.coverItemId);
}

interface CardProps<T> {
  readonly memory: T;
  readonly onPlay: () => void;
}

function WeekCard({
  memory,
  onPlay,
  wide,
}: CardProps<WeekMemory> & { readonly wide: boolean }): ReactNode {
  const cover = useCovers(memory)[0] ?? null;
  const title = memoryTitle(memory);
  return (
    <Card
      padding="none"
      label={`Play ${title}`}
      onPress={onPlay}
      className={cn('overflow-hidden', wide ? 'min-w-0 flex-1' : 'w-75')}
    >
      <View className="h-30">
        <MemoryPicture item={cover} size="thumb" className="absolute inset-0" />
        <PhotoMark label={weekMark(memory)} />
      </View>
      <View className="px-3 py-2.5">
        <Text variant="label" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular-nums">
          {cardLine(memory)}
        </Text>
      </View>
    </Card>
  );
}

export function WeekRow({
  memories,
  compact,
  onPlay,
}: {
  readonly memories: readonly WeekMemory[];
  readonly compact: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  const cards = memories.map((memory) => (
    <WeekCard
      key={memory.id}
      memory={memory}
      wide={!compact}
      onPlay={() => {
        onPlay(memory);
      }}
    />
  ));
  return compact ? (
    <HScroller label="This week">{cards}</HScroller>
  ) : (
    <View className="flex-row gap-3">{cards}</View>
  );
}
