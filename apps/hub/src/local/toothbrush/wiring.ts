import type { AdapterSink, DeviceRow, MetricSeries, WatchBridge } from '@smarteverything/domain';
import type { Clock } from '../../clock';
import type { ExtensionContext } from '../../extensions';
import { deviceTarget } from '../../metrics/viewers';
import { WatchBridges } from '../watch-bridge';
import type { ActDeps } from './acts';
import { BrushActionBroker } from './broker';
import { homeClock, type HomeClock } from './clock';
import type { CommandDeps } from './commands';
import { Fleet } from './fleet';
import { BrushIngest, type LivePublisher } from './ingest';
import { Publisher } from './publisher';
import type { ViewDeps } from './views';

class SinkMissingError extends Error {
  override readonly name = 'SinkMissingError';

  constructor() {
    super('The toothbrush driver has not started, so there is no place to publish state.');
  }
}

class SinkSlot {
  private current: AdapterSink | null = null;

  set(sink: AdapterSink | null): void {
    this.current = sink;
  }

  require(): AdapterSink {
    if (this.current === null) {
      throw new SinkMissingError();
    }
    return this.current;
  }
}

export interface Wiring {
  readonly slot: SinkSlot;
  readonly fleet: Fleet;
  readonly bridges: WatchBridges;
  readonly broker: BrushActionBroker;
  readonly publisher: Publisher;
  readonly ingest: BrushIngest;
  readonly holderOf: (device: DeviceRow) => string | null;
  readonly commands: CommandDeps;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
}

function livePublisher(context: ExtensionContext): LivePublisher {
  return {
    watched: (deviceId): boolean => context.hub.drivers.viewers.watched(deviceTarget(deviceId)),
    publish: (deviceId, noticeFor): void => {
      context.live.watches.publishEach(deviceId, noticeFor);
    },
  };
}

function ingestOf(
  context: ExtensionContext,
  parts: Pick<Wiring, 'fleet' | 'publisher' | 'slot'> & { readonly home: HomeClock },
  clock: Clock,
): BrushIngest {
  return new BrushIngest({
    store: context.store,
    fleet: parts.fleet,
    publisher: parts.publisher,
    sink: (): AdapterSink => parts.slot.require(),
    local: context.hub.local,
    clock: parts.home,
    live: livePublisher(context),
    now: clock.now,
    at: clock.at,
    log: context.log,
  });
}

function viewDeps(
  context: ExtensionContext,
  parts: Pick<Wiring, 'fleet' | 'bridges'> & { readonly home: HomeClock },
  now: () => Date,
): ViewDeps {
  const { hub, store } = context;
  return {
    store,
    fleet: parts.fleet,
    clock: parts.home,
    holder: (device): WatchBridge | null => parts.bridges.holderOf(device),
    series: (deviceId, capability): MetricSeries =>
      hub.drivers.metrics.read(deviceId, capability, '30d'),
    now,
  };
}

export function buildWiring(context: ExtensionContext, clock: Clock): Wiring {
  const { store, hub, log } = context;
  const slot = new SinkSlot();
  const home = homeClock(store);
  const fleet = new Fleet({ store, log });
  const bridges = new WatchBridges({
    observe: (externalId, values): Promise<void> => hub.local.observe(externalId, values),
    now: clock.now,
    log,
  });
  const holderOf = (device: DeviceRow): string | null => bridges.holderOf(device)?.clientId ?? null;
  const publisher = new Publisher({
    sink: (): AdapterSink => slot.require(),
    metrics: hub.drivers.metrics,
  });
  const ingest = ingestOf(context, { fleet, publisher, slot, home }, clock);
  const broker = new BrushActionBroker(context.pushCommands, log);
  return {
    slot,
    fleet,
    bridges,
    broker,
    publisher,
    ingest,
    holderOf,
    commands: { store, fleet, broker, holderOf, now: clock.now, log },
    views: viewDeps(context, { fleet, bridges, home }, clock.now),
    acts: { store, fleet, local: hub.local, bridges, broker, holderOf, now: clock.now, log },
  };
}
