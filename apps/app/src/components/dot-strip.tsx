import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { Text } from './text';

export interface Dot {
  readonly key: string;
  readonly colour: string | null;
  readonly state: 'on' | 'off' | 'offline';
}

export interface DotStripProps {
  readonly dots: readonly Dot[];
  readonly max?: number;
}

const DEFAULT_MAX = 8;

const RING: Readonly<Record<Dot['state'], string>> = {
  on: 'bg-primary',
  off: 'border-2 border-on-surface-variant',
  offline: 'border-2 border-dashed border-on-surface-variant',
};

export function DotStrip({ dots, max = DEFAULT_MAX }: DotStripProps): ReactNode {
  const shown = dots.slice(0, max);
  const more = dots.length - shown.length;
  return (
    <View className="flex-row items-center gap-1.5" aria-hidden pointerEvents="none">
      {shown.map((dot) => (
        <View
          key={dot.key}
          className={cn('size-2.5 rounded-full', RING[dot.state])}
          style={
            dot.state === 'on' && dot.colour !== null ? { backgroundColor: dot.colour } : undefined
          }
        />
      ))}
      {more > 0 ? (
        <Text variant="caption" tone="variant">
          {`+${String(more)}`}
        </Text>
      ) : null}
    </View>
  );
}
