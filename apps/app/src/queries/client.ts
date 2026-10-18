import { QueryClient, focusManager, notifyManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { isNative } from '../design/platform';
import { Logger } from '@smarteverything/logging';
import { watchQueryCache } from './query-log';

const log = new Logger('app.queries');

export function makeQueryClient(): QueryClient {
  notifyManager.setScheduler(queueMicrotask);
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 10 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: 0 },
    },
  });
  watchQueryCache(client);
  return client;
}

function watchNative(): () => void {
  const appState = AppState.addEventListener('change', (state) => {
    log.info('focus.changed', { appState: state });
    focusManager.setFocused(state === 'active');
  });
  const network = NetInfo.addEventListener((state) => {
    log.info('online.changed', {
      connected: state.isConnected,
      reachable: state.isInternetReachable,
      type: state.type,
    });
    onlineManager.setOnline(state.isConnected !== false);
  });
  return (): void => {
    appState.remove();
    network();
  };
}

function watchBrowser(): () => void {
  const up = (): void => {
    log.info('online.changed', { connected: true });
    onlineManager.setOnline(true);
  };
  const down = (): void => {
    log.info('online.changed', { connected: false });
    onlineManager.setOnline(false);
  };
  window.addEventListener('online', up);
  window.addEventListener('offline', down);
  onlineManager.setOnline(window.navigator.onLine);
  return (): void => {
    window.removeEventListener('online', up);
    window.removeEventListener('offline', down);
  };
}

export function watchDevice(): () => void {
  return isNative() ? watchNative() : watchBrowser();
}
