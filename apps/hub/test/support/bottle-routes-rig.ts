import type { DeviceRow } from '@smarteverything/domain';
import { BottleActions } from '../../src/local/bottle/actions';
import { BOTTLE_CAPABILITIES } from '../../src/local/bottle/capabilities';
import { BOTTLE_ENTRY_CONFIG } from '../../src/local/bottle/config';
import { planDepsOf } from '../../src/local/bottle/ingest';
import { bottleRoutes, type RouteDeps } from '../../src/local/bottle/routes';
import { bottleSetup } from '../../src/local/bottle/setup';
import { WatchBridges } from '../../src/local/watch-bridge';
import type { Caller } from '../../src/server/auth';
import type { BottleRig, Person } from './bottle-rig';
import { testLogger } from './logs';

export interface RouteRig {
  readonly routes: ReturnType<typeof bottleRoutes>;
  readonly bridges: WatchBridges;
  readonly removed: string[];
  readonly caller: (person: Person) => Caller;
}

function fakeLocal(rig: BottleRig, removed: string[]): RouteDeps['local'] {
  const store = rig.test.store;
  return {
    deviceOf: (entry): DeviceRow | undefined => store.devices.byExternal('local', entry.externalId),
    add: (setup): Promise<DeviceRow> => {
      if (setup.driver !== 'larq_bottle') {
        throw new Error('only bottles are added in this rig');
      }
      const resolved = bottleSetup(setup, { now: rig.clock.now(), today: '2026-10-18' });
      store.localDevices.add(resolved.entry);
      const [stored] = store.devices.upsert([
        {
          provider: 'local',
          externalId: resolved.entry.externalId,
          parentId: null,
          kind: 'other',
          name: setup.name,
          model: BOTTLE_ENTRY_CONFIG.parse(resolved.entry.config).model,
          manufacturer: 'larq',
          providerRoom: null,
          roomId: null,
          online: true,
          capabilities: [...BOTTLE_CAPABILITIES],
          details: {},
        },
      ]);
      if (stored === undefined) {
        throw new Error('the bottle was not stored');
      }
      return Promise.resolve(stored);
    },
    remove: (device): Promise<void> => {
      removed.push(device.id);
      return Promise.resolve();
    },
  };
}

export function routeRig(rig: BottleRig): RouteRig {
  const bridges = new WatchBridges({
    observe: (): Promise<void> => Promise.resolve(),
    now: rig.clock.now,
    log: testLogger('bottle'),
  });
  const removed: string[] = [];
  const plan = planDepsOf(rig.ingestDeps);
  const routes = bottleRoutes({
    store: rig.test.store,
    local: fakeLocal(rig, removed),
    bridges,
    ingest: rig.ingest,
    broker: rig.broker,
    actions: new BottleActions({ store: rig.test.store, broker: rig.broker, bridges, plan }),
    plan,
    views: rig.views,
    acts: rig.acts,
    stats: rig.stats,
    now: rig.clock.now,
  });
  return {
    routes,
    bridges,
    removed,
    caller: (person) => ({ kind: 'client', client: rig.test.store.clients.byId(person.client.id) }),
  };
}

export function raw(parts: { params?: unknown; query?: unknown; body?: unknown }): {
  params: unknown;
  query: unknown;
  body: unknown;
  remote: string;
} {
  return {
    params: parts.params ?? {},
    query: parts.query ?? {},
    body: parts.body,
    remote: '127.0.0.1',
  };
}
