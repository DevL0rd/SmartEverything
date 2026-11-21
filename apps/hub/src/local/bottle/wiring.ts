import type { DeviceRow } from '@smarteverything/domain';
import type { ExtensionContext } from '../../extensions';
import { FleetRoster } from '../fleet-roster';
import { WatchBridges } from '../watch-bridge';
import type { ActDeps } from './acts';
import { BottleActions } from './actions';
import { BottleActionBroker } from './broker';
import { homeClock } from './clock';
import type { CommandDeps } from './commands';
import { BOTTLE_DRIVER } from './config';
import { BottleIngest } from './ingest';
import type { BottleReadDeps } from './reads';
import { SinkSlot } from './sink';
import { StatsCache } from './views-stats';

export interface Wiring {
  readonly slot: SinkSlot;
  readonly roster: FleetRoster;
  readonly bridges: WatchBridges;
  readonly broker: BottleActionBroker;
  readonly actions: BottleActions;
  readonly ingest: BottleIngest;
  readonly stats: StatsCache;
  readonly views: BottleReadDeps;
  readonly acts: ActDeps;
  readonly commands: CommandDeps;
}

function rosterOf(context: ExtensionContext): FleetRoster {
  return new FleetRoster({
    store: context.store,
    accepts: (entry): boolean => entry.driver === BOTTLE_DRIVER,
    name: 'bottle',
  });
}

export function buildWiring(context: ExtensionContext, now: () => Date): Wiring {
  const { store, hub, log } = context;
  const clock = homeClock(store.live.home.settings);
  const roster = rosterOf(context);
  const slot = new SinkSlot();
  const bridges = new WatchBridges({
    observe: (externalId, values): Promise<void> => hub.local.observe(externalId, values),
    now,
    log,
  });
  const broker = new BottleActionBroker(context.pushCommands, log);
  const actions = new BottleActions({ store, broker, bridges, now });
  const stats = new StatsCache();
  return {
    slot,
    roster,
    bridges,
    broker,
    actions,
    stats,
    ingest: new BottleIngest({
      store,
      roster,
      sink: () => slot.require(),
      local: hub.local,
      now,
      log,
    }),
    views: {
      store,
      holder: (device: DeviceRow) => bridges.holderOf(device),
      syncing: (deviceId) => broker.isRunning(deviceId),
      clock,
      now,
      stats,
    },
    acts: { store, roster, actions, bridges, local: hub.local, stats, clock, now, log },
    commands: { store, roster, actions, log },
  };
}
