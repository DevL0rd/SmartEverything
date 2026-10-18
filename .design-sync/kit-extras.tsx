import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  NavigationContainer,
  StackRouter,
  createNavigatorFactory,
  useNavigationBuilder,
} from 'expo-router/react-navigation';
import { View } from 'react-native';
import Head from 'expo-router/head';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CLIENT_PREFS } from '../packages/domain/src';
import { applyTheme, startTheme } from '../apps/app/src/design/theme';
import { ThemeScope } from '../apps/app/src/design/theme-scope';

export { ThemeScope };

function SingleNavigator({ children }: { readonly children?: ReactNode }): ReactNode {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(StackRouter, {
    children,
  });
  const route = state.routes[state.index];
  return (
    <NavigationContent>
      {route === undefined ? null : descriptors[route.key]?.render()}
    </NavigationContent>
  );
}

const { Navigator, Screen } = createNavigatorFactory(SingleNavigator)();

function NavigationFrame({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <NavigationContainer documentTitle={{ enabled: false }}>
      <Navigator>
        <Screen name="preview">{() => children}</Screen>
      </Navigator>
    </NavigationContainer>
  );
}

export function DsRoot({
  theme = 'dark',
  children,
}: {
  readonly theme?: 'dark' | 'light';
  readonly children: ReactNode;
}): ReactNode {
  const [client] = useState(() => new QueryClient());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const stop = startTheme();
    setReady(true);
    return stop;
  }, []);
  useLayoutEffect(() => {
    applyTheme({ ...CLIENT_PREFS.appearance.defaultValue, theme });
    document.body.style.backgroundColor = 'var(--color-bg)';
  }, [theme]);
  if (!ready) {
    return null;
  }
  return (
    <GestureHandlerRootView className="flex-1 bg-bg">
      <SafeAreaProvider>
        <QueryClientProvider client={client}>
          <Head.Provider>
            <NavigationFrame>{children}</NavigationFrame>
          </Head.Provider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function Stage({
  theme,
  width,
  height,
  children,
}: {
  readonly theme: 'dark' | 'light';
  readonly width?: number;
  readonly height?: number;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <ThemeScope theme={theme}>
      <View
        className="bg-bg p-4"
        style={{
          ...(width === undefined ? {} : { width }),
          ...(height === undefined ? {} : { height }),
        }}
      >
        {children}
      </View>
    </ThemeScope>
  );
}

export { notify } from '../apps/app/src/components/toast-store';
export { confirm } from '../apps/app/src/components/confirm-store';

export function GlobalTheme({
  theme,
  children,
}: {
  readonly theme: 'dark' | 'light';
  readonly children: ReactNode;
}): ReactNode {
  useEffect(() => {
    applyTheme({ ...CLIENT_PREFS.appearance.defaultValue, theme });
  }, [theme]);
  return children;
}

export { useBoardEditor } from '../apps/app/src/components/widget-board/edit/use-board-editor';
