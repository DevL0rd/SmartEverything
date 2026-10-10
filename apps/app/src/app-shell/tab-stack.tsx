import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Stack, useIsFocused } from 'expo-router';
import { useColour } from '../design/colour';
import { isNative } from '../design/platform';

export function useStackOptions(): {
  readonly headerShown: false;
  readonly animation: 'default' | 'fade';
  readonly contentStyle: { readonly backgroundColor: string };
} {
  return {
    headerShown: false,
    animation: isNative() ? 'default' : 'fade',
    contentStyle: { backgroundColor: useColour('bg') },
  };
}

export function TabStack(): ReactNode {
  const focused = useIsFocused();
  return (
    <View className={focused ? 'flex-1' : 'hidden'} aria-hidden={!focused}>
      <Stack screenOptions={useStackOptions()} />
    </View>
  );
}
