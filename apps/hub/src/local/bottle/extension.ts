import type { ExtensionContext, RunningExtension, ServerExtension } from '../../extensions';
import { bottleDriver } from './commands';
import { bottleRoutes } from './routes';
import { buildWiring } from './wiring';

const INVALIDATING_TABLES: ReadonlySet<string> = new Set(['health_entries', 'health_daily']);

export function bottlesExtension(now: () => Date): ServerExtension {
  return (context: ExtensionContext): Promise<RunningExtension> => {
    const wiring = buildWiring(context, now);
    const unfollow = context.store.feed.subscribe((change) => {
      if (INVALIDATING_TABLES.has(change.table)) {
        wiring.stats.invalidate();
      }
    });
    const unregister = context.hub.drivers.registry.register(
      bottleDriver(wiring.commands, (driverContext) => {
        wiring.slot.set(driverContext.sink);
        return Promise.resolve(() => {
          wiring.slot.set(null);
          return Promise.resolve();
        });
      }),
    );
    return Promise.resolve({
      endpoints: bottleRoutes({
        store: context.store,
        local: context.hub.local,
        bridges: wiring.bridges,
        ingest: wiring.ingest,
        broker: wiring.broker,
        actions: wiring.actions,
        plan: wiring.plan,
        views: wiring.views,
        acts: wiring.acts,
        stats: wiring.stats,
        now,
      }),
      routes: [],
      stop: (): Promise<void> => {
        unfollow();
        unregister();
        wiring.broker.stop();
        return Promise.resolve();
      },
    });
  };
}
