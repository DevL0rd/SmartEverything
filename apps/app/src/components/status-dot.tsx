import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { STATUS_FILL, type StatusTone } from './tone';

type DotSize = 8 | 10;

type DotRing = 'bg' | 'surface-1';

const SIZE: Readonly<Record<DotSize, string>> = { 8: 'size-3', 10: 'size-3.5' };

const RING: Readonly<Record<DotRing, string>> = {
  bg: 'border-bg',
  'surface-1': 'border-surface-1',
};

export interface StatusDotProps {
  readonly tone: StatusTone;
  readonly label: string;
  readonly size?: DotSize;
  readonly ring?: DotRing;
}

export function StatusDot({ tone, label, size = 10, ring = 'bg' }: StatusDotProps): ReactNode {
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      className={cn(
        'absolute -bottom-0.5 -right-0.5 rounded-full border-2',
        SIZE[size],
        RING[ring],
        STATUS_FILL[tone],
      )}
    />
  );
}
