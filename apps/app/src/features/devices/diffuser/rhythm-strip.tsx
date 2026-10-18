import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyGraph } from '../../../components/charts';
import { Text } from '../../../components/text';
import { percentString } from '../../../components/level-math';
import { cn } from '../../../design/cn';
import { RHYTHM_WINDOW_MINUTES, sprayOffsets } from './diffuser-model';

const DOT = 8;
const NOW_DOT = 12;
const PERCENT = 100;

function Dot({ offset, height }: { readonly offset: number; readonly height: number }): ReactNode {
  const size = offset === 0 ? NOW_DOT : DOT;
  const place = {
    left: percentString((offset / RHYTHM_WINDOW_MINUTES) * PERCENT),
    width: size,
    height: size,
    marginLeft: offset === 0 ? 0 : -size / 2,
    top: (height - size) / 2,
  } as const;
  return <View className="absolute rounded-full bg-primary" style={place} />;
}

export function RhythmStrip({
  intervalMinutes,
  paused,
  height,
}: {
  readonly intervalMinutes: number | null;
  readonly paused: boolean;
  readonly height: number;
}): ReactNode {
  if (intervalMinutes === null) {
    return <EmptyGraph text="Waiting for the first reading" height={height} />;
  }
  const lane = { height };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Sprays about every ${String(intervalMinutes)} minutes while it is on`}
      className="w-full gap-0.5"
    >
      <View style={lane} className={cn('mx-1 justify-center', paused && 'opacity-40')}>
        <View className="absolute inset-x-0 h-px bg-outline" />
        {sprayOffsets(intervalMinutes).map((offset) => (
          <Dot key={offset} offset={offset} height={height} />
        ))}
      </View>
      {paused ? null : (
        <View className="flex-row justify-between px-1">
          <Text variant="caption" tone="faint">
            Now
          </Text>
          <Text variant="caption" tone="faint">
            +2 h
          </Text>
        </View>
      )}
    </View>
  );
}
