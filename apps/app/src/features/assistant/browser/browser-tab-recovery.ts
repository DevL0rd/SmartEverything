import { routeFor } from '../../../api/connection/active-route';
import type { ServerConnection } from '../../../api/connection/storage';
import { browserTabOperation } from './browser-tab-operation';
import type { BrowserTabs } from './browser-tabs';

export function recoverUnavailableTabs(tabs: BrowserTabs): void {
  for (const { id, phase, source } of tabs.read().tabs) {
    if (phase === 'unavailable' && source.kind === 'project') browserTabOperation(tabs.renew(id));
  }
}

export function followRouteRecovery(owner: ServerConnection, recover: () => void): () => void {
  const route = routeFor(owner);
  return route.state.subscribe(() => {
    const { endpoint, problem } = route.state.get();
    if (endpoint !== null && problem === null) recover();
  });
}
