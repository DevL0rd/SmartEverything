import type { HubLayout } from '../data-layout';
import type { LiveHub } from '../server/live';
import {
  hubUpdateSourceRoutes,
  type HubUpdateSourceRoutes,
} from '../server/handlers/hub-update-source';
import {
  configuredSourceCheck,
  configuredSourceTip,
  saveConfiguredSource,
  startConfiguredSource,
} from './source';
import { findUpdateSource } from './update-source';
import { watchHubUpdateSource, watchSourceCheckout } from './source-watch';

export function hubUpdateSourceWiring(
  layout: HubLayout,
  bootRunId: string | undefined,
): {
  readonly routes: HubUpdateSourceRoutes;
  readonly watch: (live: Pick<LiveHub, 'announce'>) => () => Promise<void>;
} {
  let refresh: (() => void) | undefined;
  const { routes, settleChecks } = hubUpdateSourceRoutes(
    {
      check: (owner) => configuredSourceCheck(layout, owner, bootRunId),
      start: (owner, request) => startConfiguredSource(layout, owner, request),
      save: (owner, request) => saveConfiguredSource(layout, owner, request),
    },
    () => refresh?.(),
  );
  return {
    routes,
    watch: (live): (() => Promise<void>) => {
      const configured = findUpdateSource(layout);
      if (configured === undefined) return () => Promise.resolve();
      const source = watchHubUpdateSource({
        probe: (signal) => configuredSourceTip(layout, signal),
        changed: async (signal) => {
          await settleChecks();
          if (!signal.aborted) live.announce({ type: 'hub_update_source_changed' }, 'owners');
        },
        events: (request) => watchSourceCheckout(configured.checkout, request),
      });
      refresh = source.refresh;
      return source.stop;
    },
  };
}
