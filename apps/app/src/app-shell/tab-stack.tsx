import { useContext, type ReactNode } from 'react';
import { View } from 'react-native';
import { Stack, useIsFocused } from 'expo-router';
import { useColour } from '../design/colour';
import { isNative } from '../design/platform';
import { ScreenPausedContext } from '../design/screen-pause';
import { screenPause } from './screen-pause';
import { forgetRoute, isInstantRoute } from './instant-open';

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
  const tabHidden = useContext(ScreenPausedContext);
  const options = useStackOptions();
  return (
    <View className={tabHidden ? 'hidden' : 'flex-1'} aria-hidden={!focused}>
      <Stack
        screenLayout={screenPause}
        screenListeners={{
          beforeRemove: (event) => {
            forgetRoute(event.target);
          },
        }}
        screenOptions={({ route }) =>
          isInstantRoute(route) ? { ...options, animation: 'none' } : options
        }
      />
    </View>
  );
}
