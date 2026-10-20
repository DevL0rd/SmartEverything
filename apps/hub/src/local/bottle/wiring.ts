import type { DeviceRow } from '@smarteverything/domain';
import type { ExtensionContext } from '../../extensions';
import { WatchBridges } from '../watch-bridge';
import type { ActDeps } from './acts';
import { BottleActions } from './actions';
import { BottleActionBroker } from './broker';
import { homeClock } from './clock';
import type { CommandDeps } from './commands';
import { BottleIngest, planDepsOf, type IngestDeps } from './ingest';
import type { DrinksDeps } from './drinks';
import type { PlanDeps } from './plan';
import { SinkSlot } from './sink';
import { Snapshots } from './snapshots';
import type { ViewDeps } from './view-deps';
import { StatsCache } from './views-stats';

export interface Wiring {
  readonly slot: SinkSlot;
  readonly bridges: WatchBridges;
  readonly broker: BottleActionBroker;
  readonly actions: BottleActions;
  readonly ingest: BottleIngest;
  readonly stats: StatsCache;
  readonly plan: PlanDeps;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
  readonly commands: CommandDeps;
}

interface Shared {
  readonly store: ExtensionContext['store'];
  readonly hub: ExtensionContext['hub'];
  readonly log: ExtensionContext['log'];
  readonly now: () => Date;
  readonly clock: ReturnType<typeof homeClock>;
  readonly snapshots: Snapshots;
  readonly stats: StatsCache;
  readonly bridges: WatchBridges;
  readonly broker: BottleActionBroker;
  readonly actions: BottleActions;
}

function viewDeps(shared: Shared): ViewDeps {
  const { store, bridges, broker } = shared;
  return {
    store,
    readings: store.bottleReadings,
    logs: store.bottleLogs,
    snapshots: shared.snapshots,
    clock: shared.clock,
    now: shared.now,
    holder: (device: DeviceRow) => bridges.holderOf(device),
    syncing: (deviceId) => broker.isRunning(deviceId),
    stats: shared.stats,
  };
}

function actDeps(shared: Shared): ActDeps {
  const { store, hub } = shared;
  const drinks: DrinksDeps = {
    store,
    readings: store.bottleReadings,
    clock: shared.clock,
    log: shared.log,
  };
  return {
    store,
    readings: store.bottleReadings,
    snapshots: shared.snapshots,
    drinks,
    actions: shared.actions,
    bridges: shared.bridges,
    local: hub.local,
    stats: shared.stats,
    clock: shared.clock,
    now: shared.now,
    log: shared.log,
  };
}

export function buildWiring(context: ExtensionContext, now: () => Date): Wiring {
  const { store, hub, log } = context;
  const clock = homeClock(store);
  const snapshots = new Snapshots(store.bottleLogs);
  const slot = new SinkSlot();
  const bridges = new WatchBridges({
    observe: (externalId, values): Promise<void> => hub.local.observe(externalId, values),
    now,
    log,
  });
  const broker = new BottleActionBroker(context.pushCommands, log);
  const ingestDeps: IngestDeps = {
    store,
    readings: store.bottleReadings,
    logs: store.bottleLogs,
    snapshots,
    sink: () => slot.require(),
    local: hub.local,
    clock,
    now,
    log,
  };
  const plan = planDepsOf(ingestDeps);
  const actions = new BottleActions({ store, broker, bridges, plan });
  const stats = new StatsCache();
  const shared: Shared = {
    store,
    hub,
    log,
    now,
    clock,
    snapshots,
    stats,
    bridges,
    broker,
    actions,
  };
  return {
    slot,
    bridges,
    broker,
    actions,
    stats,
    plan,
    ingest: new BottleIngest(ingestDeps),
    views: viewDeps(shared),
    acts: actDeps(shared),
    commands: { store, actions, log },
  };
}
