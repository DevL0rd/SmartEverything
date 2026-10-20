import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { Logger } from '@smarteverything/logging';
import { Stack, useIsFocused, useRoute } from 'expo-router';
import { useColour } from '../design/colour';
import { isNative } from '../design/platform';
import { screenPause } from './screen-pause';
import { forgetRoute, isInstantRoute } from './instant-open';
import { tabOfRouteName } from './nav-model';
import { leafRoutesOf, singularIdOf } from './pin-routes';
import { TabGroupContext } from './tab-group';
import { preloader } from './preloader';
import { forgetAwake } from './tab-prewarm';

const log = new Logger('app.nav');

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

function pinScreens(group: string): ReactNode {
  return leafRoutesOf(group)
    .filter((leaf) => !leaf.nested && leaf.keys.length > 0)
    .map((leaf) => (
      <Stack.Screen key={leaf.route} name={leaf.route} dangerouslySingular={singularIdOf(leaf)} />
    ));
}

export function TabStack({
  initialRouteName,
  children,
}: {
  readonly initialRouteName: string;
  readonly children?: ReactNode;
}): ReactNode {
  const focused = useIsFocused();
  const options = useStackOptions();
  const group = useRoute().name;
  useEffect(() => {
    const tab = focused ? tabOfRouteName(group) : null;
    log.debug('tab.focus_changed', { group, focused, tab });
    if (tab !== null) {
      preloader.boostSection(tab);
    }
  }, [focused, group]);
  return (
    <TabGroupContext value={group}>
      <View className="flex-1" aria-hidden={!focused}>
        <Stack
          initialRouteName={initialRouteName}
          screenLayout={screenPause}
          screenListeners={{
            beforeRemove: (event) => {
              log.debug('stack.route_removing', {
                group,
                target: event.target ?? null,
              });
              forgetRoute(event.target);
              forgetAwake(event.target);
            },
          }}
          screenOptions={({ route }) =>
            isInstantRoute(route) ? { ...options, animation: 'none' } : options
          }
        >
          {children}
          {pinScreens(group)}
        </Stack>
      </View>
    </TabGroupContext>
  );
}
