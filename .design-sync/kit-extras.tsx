import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import {
  NavigationContainer,
  StackRouter,
  useNavigationBuilder,
} from 'expo-router/react-navigation';
import { Screen } from 'expo-router/build/react-navigation/core/Screen';
import type {
  NavigationAction,
  ParamListBase,
  RouterFactory,
  StackNavigationState,
  StackRouterOptions,
} from 'expo-router/build/react-navigation/routers';
import { View } from 'react-native';
import Head from 'expo-router/head';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CLIENT_PREFS } from '../packages/domain/src';
import { applyTheme, startTheme } from '../apps/app/src/design/theme';
import { ThemeScope } from '../apps/app/src/design/theme-scope';

export { ThemeScope };

type StackAction = Parameters<ReturnType<typeof StackRouter>['getStateForAction']>[1];

function previewStackAction(action: NavigationAction): StackAction | null {
  const { type, payload, ...origin } = action;
  if (type === 'GO_BACK') return { type, ...origin };
  if (payload === undefined) return null;

  const params: unknown = Reflect.get(payload, 'params');
  const routeParams = typeof params === 'object' && params !== null ? { params } : {};
  if (type === 'SET_PARAMS' || type === 'REPLACE_PARAMS') {
    return { type, ...origin, payload: routeParams };
  }

  const name: unknown = Reflect.get(payload, 'name');
  if (type !== 'NAVIGATE' || name !== 'preview') return null;
  return { type, ...origin, payload: { name, ...routeParams } };
}

const previewRouter: RouterFactory<
  StackNavigationState<ParamListBase>,
  NavigationAction,
  StackRouterOptions
> = (options) => {
  const { actionCreators: _actionCreators, ...router } = StackRouter(options);
  return {
    ...router,
    getStateForAction: (
      state,
      action,
      config,
    ): ReturnType<ReturnType<typeof StackRouter>['getStateForAction']> => {
      const stackAction = previewStackAction(action);
      return stackAction === null ? null : router.getStateForAction(state, stackAction, config);
    },
  };
};

function SingleNavigator({ children }: { readonly children?: ReactNode }): ReactNode {
  const { state, descriptors, NavigationContent } = useNavigationBuilder(previewRouter, {
    children,
  });
  const route = state.routes[state.index];
  return (
    <NavigationContent>
      {route === undefined ? null : descriptors[route.key]?.render()}
    </NavigationContent>
  );
}

function NavigationFrame({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <NavigationContainer documentTitle={{ enabled: false }}>
      <SingleNavigator>
        <Screen name="preview">{() => children}</Screen>
      </SingleNavigator>
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
export { Grid as LayoutGrid } from '../apps/app/src/components/grid';
export { Overlay as ModalOverlay } from '../apps/app/src/components/overlay';
