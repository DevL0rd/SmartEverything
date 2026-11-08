import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Memory } from '@smarteverything/domain';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { memoryTitle, type HeroMemory } from '../memories/model';
import {
  BOARD_TILES,
  coverLabel,
  fromYearsText,
  onThisDayOf,
  sideLabel,
  tileLabel,
  type OnThisDay,
} from './memories-model';
import { MemoryTile } from './memory-tile';

const COVER_WEIGHT = 'flex-2';
const SIDE_WEIGHT = 'flex-1';
const LEAD_WEIGHT = 'flex-3';
const REST_WEIGHT = 'flex-2';

function PagerBars({
  index,
  total,
}: {
  readonly index: number;
  readonly total: number;
}): ReactNode {
  return total < 2 ? null : (
    <View className="flex-row items-center gap-1" aria-hidden pointerEvents="none">
      {Array.from({ length: total }, (_, position) => (
        <View
          key={String(position)}
          className={cn(
            'h-1 w-3.5 rounded-full',
            position === index ? 'bg-on-surface' : 'bg-outline-variant',
          )}
        />
      ))}
    </View>
  );
}

function Footer({ day }: { readonly day: OnThisDay }): ReactNode {
  return (
    <View className="flex-row items-center justify-between gap-2">
      <Text variant="caption" tone="variant" numberOfLines={1} className="shrink tabular-nums">
        {fromYearsText(day.total, day.years)}
      </Text>
      <PagerBars index={day.index} total={day.years} />
    </View>
  );
}

export function OnThisDayFace({
  heroes,
  editing,
  onPlay,
}: {
  readonly heroes: readonly HeroMemory[];
  readonly editing: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  const [picked, setPicked] = useState(0);
  const day = onThisDayOf(heroes, picked);
  if (day === null) return null;
  return (
    <View className="min-h-0 flex-1 gap-2">
      <View className="min-h-0 flex-1 flex-row gap-1">
        <MemoryTile
          key={day.cover.id}
          memory={day.cover}
          label={coverLabel(day.cover)}
          action={`Play ${memoryTitle(day.cover)}`}
          size="preview"
          weight={COVER_WEIGHT}
          editing={editing}
          onPress={() => {
            onPlay(day.cover);
          }}
        />
        {day.sides.length === 0 ? null : (
          <View testID="memories-side-column" className={cn('min-h-0 min-w-0 gap-1', SIDE_WEIGHT)}>
            {day.sides.map((memory) => (
              <MemoryTile
                key={memory.id}
                memory={memory}
                label={sideLabel(memory)}
                action={`Show ${memoryTitle(memory)}`}
                size="thumb"
                weight={SIDE_WEIGHT}
                editing={editing}
                onPress={() => {
                  setPicked(heroes.indexOf(memory));
                }}
              />
            ))}
          </View>
        )}
      </View>
      <Footer day={day} />
    </View>
  );
}

export function BoardFace({
  memories,
  editing,
  onPlay,
}: {
  readonly memories: readonly Memory[];
  readonly editing: boolean;
  readonly onPlay: (memory: Memory) => void;
}): ReactNode {
  return (
    <View className="min-h-0 flex-1 flex-row gap-1">
      {memories.slice(0, BOARD_TILES).map((memory, position) => (
        <MemoryTile
          key={memory.id}
          memory={memory}
          label={tileLabel(memory)}
          action={`Play ${memoryTitle(memory)}`}
          size={position === 0 ? 'preview' : 'thumb'}
          weight={position === 0 ? LEAD_WEIGHT : REST_WEIGHT}
          editing={editing}
          onPress={() => {
            onPlay(memory);
          }}
        />
      ))}
    </View>
  );
}
