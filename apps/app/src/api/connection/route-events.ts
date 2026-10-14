import { AppState } from 'react-native';
import { appPlatform } from '../../design/platform';
import type { ActiveHubRoute } from './active-route';
import { hubNetwork } from './route-platform';
import { Logger } from '@smarteverything/logging';

const log = new Logger('app.hub-route');

export function followHubNetwork(manager: ActiveHubRoute): () => void {
  if (hubNetwork().routeAuthority !== undefined) return () => undefined;
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      manager.discover();
      manager.refresh();
    }
  });
  if (appPlatform() === 'web') {
    const online = (): void => {
      manager.refresh();
    };
    window.addEventListener('online', online);
    return () => {
      foreground.remove();
      window.removeEventListener('online', online);
    };
  }
  const network = hubNetwork();
  const stop = network.subscribeNetwork(() => {
    manager.discover();
    manager.refresh();
  });
  void network.startNetwork().catch((error: unknown) => {
    log.warn('route.network_failed', {
      failure: error instanceof Error ? error.name : 'NativeFailure',
    });
  });
  return () => {
    foreground.remove();
    stop();
    void network.stopNetwork().catch((error: unknown) => {
      log.warn('route.network_stop_failed', {
        failure: error instanceof Error ? error.name : 'NativeFailure',
      });
    });
  };
}
