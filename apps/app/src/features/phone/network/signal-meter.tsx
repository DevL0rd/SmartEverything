import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../../design/cn';
import { signalTone, signalWord, type SignalTone } from './network-model';

const BAR_COUNT = 4;

const LIT: Readonly<Record<SignalTone, string>> = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  critical: 'bg-critical',
  faint: 'bg-outline',
};

const HEIGHT = ['h-2', 'h-3', 'h-4', 'h-5'] as const;

const LARGE_HEIGHT = ['h-3', 'h-5', 'h-7', 'h-10'] as const;

export function SignalMeter({
  bars,
  large = false,
  name,
}: {
  readonly bars: number;
  readonly large?: boolean;
  readonly name: string;
}): ReactNode {
  const heights = large ? LARGE_HEIGHT : HEIGHT;
  const tone = signalTone(bars);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name} signal, ${signalWord(bars).toLowerCase()}, ${String(bars)} of ${String(BAR_COUNT)} bars`}
      className={cn('shrink-0 flex-row items-end gap-1', large ? 'h-10' : 'h-5')}
    >
      {heights.map((height, index) => (
        <View
          key={height}
          className={cn(
            large ? 'w-2' : 'w-1',
            'rounded-full',
            height,
            index < bars ? LIT[tone] : 'bg-outline',
          )}
        />
      ))}
    </View>
  );
}
