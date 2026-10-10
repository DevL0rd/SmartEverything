import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { isNative } from '../design/platform';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
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
}

function watchNative(): () => void {
  const appState = AppState.addEventListener('change', (state) => {
    focusManager.setFocused(state === 'active');
  });
  const network = NetInfo.addEventListener((state) => {
    onlineManager.setOnline(state.isConnected !== false);
  });
  return (): void => {
    appState.remove();
    network();
  };
}

function watchBrowser(): () => void {
  const up = (): void => {
    onlineManager.setOnline(true);
  };
  const down = (): void => {
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
