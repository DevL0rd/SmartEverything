import { Logger } from '@smarteverything/logging';
import { errorFields } from '../design/log-tally';
import type { ActiveHubRoute } from '../api/connection/active-route';
import { StaleHubRouteError } from '../api/connection/route-policy';

const log = new Logger('app.live-route');

interface RouteIds {
  readonly generation: number;
  readonly scopeId: string | number;
  readonly startedAt: number;
}

function noteRoute(event: string, ids: RouteIds, stale: boolean, error?: unknown): void {
  log.info(event, {
    generation: ids.generation,
    scopeId: ids.scopeId,
    durationMs: Date.now() - ids.startedAt,
    stale,
    ...(error === undefined ? {} : errorFields(error)),
  });
}

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
    const ids = { generation, scopeId, startedAt: Date.now() };
    void manager
      .ready()
      .then(() => {
        const live = current();
        noteRoute('route.ready', ids, !live);
        if (live) handlers.ready();
      })
      .catch((error: unknown) => {
        const stale = !current() || error instanceof StaleHubRouteError;
        noteRoute('route.failed', ids, stale, error);
        if (stale) return;
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
