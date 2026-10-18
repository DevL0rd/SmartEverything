import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useThemeSetting } from '../design/theme';

export function Ambient(): ReactNode {
  const background = useThemeSetting('background');
  if (background === 'off') {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      className="absolute inset-x-0 top-0 h-96 bg-linear-to-b from-primary/8 via-primary/2 to-transparent"
    />
  );
}
