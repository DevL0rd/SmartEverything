import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaListener, SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { Uniwind } from 'uniwind';
import { HomeHost } from '../../app-shell/home-host';
import { preloader } from '../../app-shell/preloader';
import { ConfirmHost } from '../../components/confirm-host';
import { LinkIntentProvider } from '../../components/link-intent';
import { notify } from '../../components/toast-store';
import { Toasts } from '../../components/toasts';
import { ConnectionProvider } from '../../api/transport';
import { startTheme } from '../../design/theme';
import { developerFlags } from '../../developer/flags';
import { perfTouch } from '../../perf/touch';
import { makeQueryClient, watchDevice } from '../../queries/client';
import { startClock } from '../../store/clock';
import { loadLocalPrefs } from '../../store/local-prefs';

function useStartup(): void {
  useEffect(() => startTheme(), []);
  useEffect(() => startClock(), []);
  useEffect(() => watchDevice(), []);
  useEffect(() => {
    loadLocalPrefs().catch((error: unknown) => {
      notify({
        message: 'Some preferences on this device could not be read',
        error,
        tone: 'critical',
      });
    });
  }, []);
}

export function AppRoot({ children }: { readonly children: ReactNode }): ReactNode {
  const [client] = useState(makeQueryClient);
  useStartup();
  return (
    <GestureHandlerRootView className="flex-1 bg-bg">
      <SafeAreaProvider>
        <SafeAreaListener
          onChange={({ insets }) => {
            Uniwind.updateInsets(insets);
          }}
        >
          <QueryClientProvider client={client}>
            <ConnectionProvider>
              <LinkIntentProvider
                onIntent={(target) => {
                  preloader.boost(target);
                }}
              >
                <View
                  className="flex-1 bg-bg"
                  onTouchStart={() => {
                    perfTouch('start');
                    preloader.interacted();
                  }}
                  {...(developerFlags['perf.stalls']
                    ? {
                        onTouchMove: (): void => {
                          perfTouch('move');
                        },
                        onTouchEnd: (): void => {
                          perfTouch('end');
                        },
                      }
                    : {})}
                >
                  <HomeHost>{children}</HomeHost>
                  <Toasts />
                  <ConfirmHost />
                </View>
              </LinkIntentProvider>
            </ConnectionProvider>
          </QueryClientProvider>
        </SafeAreaListener>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
