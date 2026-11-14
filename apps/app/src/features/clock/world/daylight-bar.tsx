import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import { cn } from '../../../design/cn';
import type { DaylightSpan } from './daylight';
import { percentOf } from './percent';

export interface DaylightBarProps {
  readonly spans: readonly DaylightSpan[];
  readonly now: number;
  readonly label: string;
  readonly slim: boolean;
}

const DOT = { slim: 10, full: 14 } as const;

function spanPlace(span: DaylightSpan): ViewStyle {
  return { left: percentOf(span.from), width: percentOf(span.to - span.from) };
}

function dotPlace(now: number, slim: boolean): ViewStyle {
  return { left: percentOf(now), marginLeft: -(slim ? DOT.slim : DOT.full) / 2 };
}

export function DaylightBar({ spans, now, label, slim }: DaylightBarProps): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className={cn('w-full justify-center', slim ? 'h-2.5' : 'h-3.5')}
    >
      <View className={cn('w-full rounded-full bg-surface-3', slim ? 'h-1.5' : 'h-2')}>
        {spans.map((span) => (
          <View
            key={span.from}
            style={spanPlace(span)}
            className="absolute inset-y-0 rounded-full bg-viz-2/60"
          />
        ))}
      </View>
      <View
        style={dotPlace(now, slim)}
        className={cn(
          'absolute rounded-full border-2 border-surface-1 bg-on-surface',
          slim ? 'size-2.5' : 'size-3.5',
        )}
      />
    </View>
  );
}
