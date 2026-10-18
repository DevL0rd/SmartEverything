import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';

export type ScrimEdge = 'top' | 'bottom';

export function EdgeScrim({ edge }: { readonly edge: ScrimEdge }): ReactNode {
  return (
    <View
      pointerEvents="none"
      className={cn(
        'absolute inset-0 from-scrim via-scrim/70 via-60% to-transparent',
        edge === 'top' ? 'bg-linear-to-b' : 'bg-linear-to-t',
      )}
    />
  );
}
