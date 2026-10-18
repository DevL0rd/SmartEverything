import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { Redirect, SplashScreen } from 'expo-router';
import { forgetServer, loadConnection, useConnection } from '../api/transport';
import { Button } from '../components/button';
import { ErrorState } from '../components/error-state';
import { Text } from '../components/text';
import { notify } from '../components/toast-store';
import { useLocalPrefsStatus } from '../store/local-prefs';
import { useLoaded, useSyncStatus } from '../store/selectors';
import { Logger, background } from '@smarteverything/logging';
import { StartupPending } from '../features/root/startup-pending';
import { ThemeSync } from './theme-sync';

const log = new Logger('app.nav');

function Centered({ children }: { readonly children: ReactNode }): ReactNode {
  return <View className="flex-1 items-center justify-center gap-4 p-6">{children}</View>;
}

function Opening(): ReactNode {
  const sync = useSyncStatus();
  useEffect(() => {
    log.info('gate.opening_shown');
    SplashScreen.hide();
  }, []);
  useEffect(() => {
    if (sync.problem !== null) {
      log.warn('gate.opening_problem', { status: sync.status, problemLength: sync.problem.length });
    }
  }, [sync.problem, sync.status]);
  if (sync.problem !== null) {
    return (
      <Centered>
        <ErrorState page error={new Error(sync.problem)} />
      </Centered>
    );
  }
  return (
    <Centered>
      <Text variant="title-2">SmartEverything</Text>
      <Text variant="callout" tone="variant">
        Opening your home…
      </Text>
    </Centered>
  );
}

export function LoadedGate({ children }: { readonly children: ReactNode }): ReactNode {
  const prefs = useLocalPrefsStatus();
  const loaded = useLoaded();
  useEffect(() => {
    log.info('gate.loaded_changed', { loaded, prefs });
  }, [loaded, prefs]);
  if (!loaded || prefs === 'loading') {
    return <Opening />;
  }
  return (
    <>
      <ThemeSync />
      {children}
    </>
  );
}

function forget(): void {
  forgetServer().catch((error: unknown) => {
    notify({ message: 'This device was not unpaired', error, tone: 'critical' });
  });
}

export function ShellGate({ children }: { readonly children: ReactNode }): ReactNode {
  const state = useConnection();
  useEffect(() => {
    log.info('gate.connection_status', { status: state.status });
  }, [state.status]);
  switch (state.status) {
    case 'loading':
      return <StartupPending stage="reading this device's server connection" />;
    case 'unpaired':
      return <Redirect href="/pair" />;
    case 'unavailable':
      return (
        <Centered>
          <ErrorState
            page
            error={new Error(state.problem)}
            retry={() => {
              background(loadConnection(), 'connection.load_failed');
            }}
          />
        </Centered>
      );
    case 'removed':
      return (
        <Centered>
          <Text variant="title-2">This device was removed</Text>
          <Text variant="body" tone="variant" align="center">
            {`Your server at ${state.url} no longer accepts this device.`}
          </Text>
          <Button label="Pair again" onPress={forget} />
        </Centered>
      );
    case 'paired':
      return children;
  }
}
