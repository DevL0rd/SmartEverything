import type { AiPreviewCatalogue } from '@smarteverything/domain';
import { routeFor } from '../../../api/connection/active-route';
import type { ServerConnection } from '../../../api/connection/storage';
import { browserPublications } from './browser-publications';
import { browserTabOperation } from './browser-tab-operation';
import type { BrowserTabs } from './browser-tabs';

export function recoverUnavailableTabs(
  tabs: BrowserTabs,
  catalogue: AiPreviewCatalogue | undefined,
): void {
  const shared = new Set(browserPublications(catalogue).map((row) => row.id));
  for (const { id, phase, source } of tabs.read().tabs) {
    if (
      phase === 'unavailable' &&
      source.kind === 'publication' &&
      shared.has(source.publication.id)
    )
      browserTabOperation(tabs.renew(id));
  }
}

export function followRouteRecovery(owner: ServerConnection, recover: () => void): () => void {
  const route = routeFor(owner);
  return route.state.subscribe(() => {
    const { endpoint, problem } = route.state.get();
    if (endpoint !== null && problem === null) recover();
  });
}
