import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useThemeSetting } from '../design/theme';

export function Ambient({ height }: { readonly height?: number } = {}): ReactNode {
  const background = useThemeSetting('background');
  if (background === 'off') {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={height === undefined ? undefined : { height }}
      className={cn(
        'absolute inset-x-0 top-0 bg-linear-to-b from-primary/8 via-primary/2 to-transparent',
        height === undefined && 'h-96',
      )}
    />
  );
}
