import { AppState } from 'react-native';
import { appPlatform } from '../../design/platform';
import type { ActiveHubRoute } from './active-route';
import { hubNetwork } from './route-platform';
import { Logger } from '@smarteverything/logging';
import { countEvent, failureFacts } from './request-log';

const log = new Logger('app.hub-route');

export function followHubNetwork(manager: ActiveHubRoute): () => void {
  if (hubNetwork().routeAuthority !== undefined) return () => undefined;
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      log.debug('route.foreground_refresh', { trigger: 'app_active' });
      manager.discover();
      manager.refresh();
    }
  });
  if (appPlatform() === 'web') {
    const online = (): void => {
      log.debug('route.foreground_refresh', { trigger: 'browser_online' });
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
    countEvent('route.network_event');
    log.debug('route.network_changed', { trigger: 'native_network' });
    manager.discover();
    manager.refresh();
  });
  void network.startNetwork().catch((error: unknown) => {
    log.warn('route.network_failed', failureFacts(error));
  });
  return () => {
    foreground.remove();
    stop();
    void network.stopNetwork().catch((error: unknown) => {
      log.warn('route.network_stop_failed', failureFacts(error));
    });
  };
}
