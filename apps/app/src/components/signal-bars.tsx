import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { signalOf, type SignalQuality } from './signal-level';

const BAR_HEIGHTS = ['h-1.5', 'h-2', 'h-3', 'h-4'] as const;

const LIT: Readonly<Record<SignalQuality, string>> = {
  good: 'bg-positive',
  fair: 'bg-warning',
  weak: 'bg-critical',
};

export interface SignalBarsProps {
  readonly dbm: number | null;
  readonly decorative?: boolean;
}

export function SignalBars({ dbm, decorative = false }: SignalBarsProps): ReactNode {
  const { bars, quality, label } = signalOf(dbm);
  const accessibility = decorative
    ? { 'aria-hidden': true }
    : { accessibilityRole: 'image' as const, accessibilityLabel: label };
  return (
    <View className="h-4 shrink-0 flex-row items-end gap-0.5" {...accessibility}>
      {BAR_HEIGHTS.map((height, index) => (
        <View
          key={height}
          className={cn('w-0.75 rounded-full', height, index < bars ? LIT[quality] : 'bg-outline')}
        />
      ))}
    </View>
  );
}
