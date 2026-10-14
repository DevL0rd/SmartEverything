import type { ActiveHubRoute } from '../api/connection/active-route';
import { StaleHubRouteError } from '../api/connection/route-policy';

interface LiveRouteReadiness {
  readonly generation: () => number;
  readonly active: () => boolean;
  readonly ready: () => void;
  readonly failed: (error: unknown) => void;
}

export function followLiveRouteReadiness(
  manager: ActiveHubRoute,
  handlers: LiveRouteReadiness,
): () => boolean {
  let retryCurrent: (() => boolean) | null = null;
  const begin = (): void => {
    retryCurrent = null;
    const generation = handlers.generation();
    const scopeId = manager.scopeId;
    const current = (): boolean =>
      generation === handlers.generation() &&
      scopeId === manager.scopeId &&
      handlers.active() &&
      manager.running;
    void manager
      .ready()
      .then(() => {
        if (current()) handlers.ready();
      })
      .catch((error: unknown) => {
        if (!current() || error instanceof StaleHubRouteError) return;
        retryCurrent = current;
        handlers.failed(error);
      });
  };
  begin();
  return (): boolean => {
    if (retryCurrent === null) return false;
    if (!retryCurrent()) {
      retryCurrent = null;
      return false;
    }
    begin();
    return true;
  };
}
