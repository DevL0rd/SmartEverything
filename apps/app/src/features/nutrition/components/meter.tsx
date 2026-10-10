import type { ReactNode } from 'react';
import { View } from 'react-native';
import { percentOf } from '../../../components/charts/stage-timeline';
import { cn } from '../../../design/cn';

export function Meter({
  progress,
  fill,
  over = false,
}: {
  readonly progress: number;
  readonly fill: string;
  readonly over?: boolean;
}): ReactNode {
  const width = { width: percentOf(Math.min(1, Math.max(0, progress))) };
  return (
    <View className="h-2 overflow-hidden rounded-full bg-surface-3">
      <View style={width} className={cn('h-full rounded-full', over ? 'bg-warning' : fill)} />
    </View>
  );
}
