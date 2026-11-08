import { env } from 'node:process';

import type { HubLayout } from '../data-layout';
import type { LiveHub } from '../server/live';
import {
  hubUpdateSourceRoutes,
  type HubUpdateSourceRoutes,
} from '../server/handlers/hub-update-source';
import {
  configuredSourceCheck,
  configuredSourceTip,
  hasConfiguredSourceCheckout,
  saveConfiguredSource,
  startConfiguredSource,
} from './source';
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
      const root = env['SMARTEVERYTHING_SELF_UPDATE_ROOT'];
      if (!hasConfiguredSourceCheckout() || root === undefined) return () => Promise.resolve();
      const source = watchHubUpdateSource({
        probe: configuredSourceTip,
        changed: async (signal) => {
          await settleChecks();
          if (!signal.aborted) live.announce({ type: 'hub_update_source_changed' }, 'owners');
        },
        events: (request) => watchSourceCheckout(root, request),
      });
      refresh = source.refresh;
      return source.stop;
    },
  };
}
