import type { AdapterSink, DeviceRow } from '@smarteverything/domain';
import type { ExtensionContext } from '../../extensions';
import { deviceTarget } from '../../metrics/viewers';
import { WatchBridges } from '../watch-bridge';
import type { ActDeps } from './acts';
import { TreadmillActionBroker } from './broker';
import type { CommandDeps } from './commands';
import { Fleet } from './fleet';
import { NoStepsGuard } from './guard';
import { TreadmillHealth } from './health';
import { TreadmillIngest, walkerProfileOf, type IngestDeps, type LivePublisher } from './ingest';
import { Publisher } from './publisher';
import type { ViewDeps } from './views';

class SinkMissingError extends Error {
  override readonly name = 'SinkMissingError';

  constructor() {
    super('The treadmill driver has not started, so there is no place to publish state.');
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
  readonly broker: TreadmillActionBroker;
  readonly health: TreadmillHealth;
  readonly guard: NoStepsGuard;
  readonly ingest: TreadmillIngest;
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

function viewDeps(
  context: ExtensionContext,
  wiring: Pick<Wiring, 'fleet' | 'bridges' | 'ingest'>,
  now: () => Date,
): ViewDeps {
  const { store, hub } = context;
  return {
    store,
    fleet: wiring.fleet,
    holder: (device) => wiring.bridges.holderOf(device),
    walkerOf: (device) => wiring.ingest.walkerFacts(device),
    series: (deviceId, capability) => hub.drivers.metrics.read(deviceId, capability, '10m'),
    now,
  };
}

export function buildWiring(context: ExtensionContext, now: () => Date): Wiring {
  const { store, hub, log } = context;
  const slot = new SinkSlot();
  const fleet = new Fleet({ store, log });
  const bridges = new WatchBridges({
    observe: (externalId, values): Promise<void> => hub.local.observe(externalId, values),
    now,
    log,
  });
  const health = new TreadmillHealth(store);
  const holderOf = (device: DeviceRow): string | null => bridges.holderOf(device)?.clientId ?? null;
  const ingestDeps: IngestDeps = {
    store,
    fleet,
    publisher: new Publisher({ sink: () => slot.require(), metrics: hub.drivers.metrics }),
    sink: () => slot.require(),
    local: hub.local,
    health,
    live: livePublisher(context),
    holderOf,
    now,
    log,
  };
  const ingest = new TreadmillIngest(ingestDeps);
  const broker = new TreadmillActionBroker(context.pushCommands, log);
  const guard = new NoStepsGuard();
  return {
    slot,
    fleet,
    bridges,
    broker,
    health,
    guard,
    ingest,
    holderOf,
    commands: {
      store,
      fleet,
      broker,
      guard,
      holderOf,
      walkerOf: (device) => walkerProfileOf(ingestDeps, device),
      holderName: (device) => bridges.holderOf(device)?.clientName ?? null,
      now,
      log,
    },
    views: viewDeps(context, { fleet, bridges, ingest }, now),
    acts: { store, fleet, local: hub.local, bridges, health, broker, holderOf, now, log },
  };
}
