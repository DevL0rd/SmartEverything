import type { ExtensionContext, RunningExtension, ServerExtension } from '../../extensions';
import { registerBottleAutomation } from './automation';
import { bottleDriver } from './commands';
import { bottleRoutes } from './routes';
import { buildWiring } from './wiring';

const INVALIDATING_TABLES: ReadonlySet<string> = new Set(['health_entries', 'health_daily']);

export function bottlesExtension(now: () => Date): ServerExtension {
  return async (context: ExtensionContext): Promise<RunningExtension> => {
    const wiring = buildWiring(context, now);
    const unroster = wiring.roster.follow({
      added: () => Promise.resolve(),
      removed: () => undefined,
    });
    await wiring.roster.load();
    const unfollow = context.store.feed.subscribe((change) => {
      if (INVALIDATING_TABLES.has(change.table)) {
        wiring.stats.invalidate();
      }
    });
    const unregisterKinds = registerBottleAutomation(context.hub.automationKinds);
    const unregister = context.hub.drivers.registry.register(
      bottleDriver(wiring.commands, (driverContext) => {
        wiring.slot.set(driverContext.sink);
        return Promise.resolve(() => {
          wiring.slot.set(null);
          return Promise.resolve();
        });
      }),
    );
    return {
      endpoints: bottleRoutes({
        store: context.store,
        roster: wiring.roster,
        local: context.hub.local,
        bridges: wiring.bridges,
        ingest: wiring.ingest,
        broker: wiring.broker,
        actions: wiring.actions,
        views: wiring.views,
        acts: wiring.acts,
        stats: wiring.stats,
        now,
      }),
      routes: [],
      stop: (): Promise<void> => {
        unroster();
        unfollow();
        unregister();
        unregisterKinds();
        wiring.broker.stop();
        return Promise.resolve();
      },
    };
  };
}
