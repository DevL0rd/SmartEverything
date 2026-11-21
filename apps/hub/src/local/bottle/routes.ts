import {
  API_ENDPOINTS as E,
  ApiError,
  type BottleActResult,
  type BottleAdd,
  type ClientRow,
  type DeviceRow,
  type LocalDeviceSetup,
  type PhoneBottles,
} from '@smarteverything/domain';
import { clientOf, profileIdOf, roleOfCaller, type Caller } from '../../server/auth';
import {
  assertDeviceReach,
  deviceHidden,
  deviceScopeOf,
  subjectOf,
} from '../../server/person-scope';
import { DONE_REPLY, bound, type Routes } from '../../server/router';
import type { Store } from '../../store/store';
import type { FleetRoster } from '../fleet-roster';
import type { LocalDevices } from '../local-devices';
import type { WatchBridges } from '../watch-bridge';
import type { Viewer } from './access';
import { actBottle, type ActDeps, type Actor } from './acts';
import type { BottleActions } from './actions';
import type { BottleActionBroker } from './broker';
import { entryConfigOf, storedConfigOf } from './config';
import type { BottleIngest } from './ingest';
import { readBottle, type BottleReadDeps } from './reads';
import type { StatsCache } from './views-stats';
import { uvRefusalOf } from './views';

export type BottleEndpointName =
  | 'readPhoneBottles'
  | 'uploadBottleSync'
  | 'answerBottleAction'
  | 'addBottle'
  | 'forgetBottle'
  | 'readBottle'
  | 'actBottle'
  | 'startBottleUv';

export interface RouteDeps {
  readonly store: Store;
  readonly roster: FleetRoster;
  readonly local: Pick<LocalDevices, 'add' | 'remove'>;
  readonly bridges: Pick<WatchBridges, 'acquire' | 'heldElsewhere' | 'holderOf' | 'pair'>;
  readonly ingest: BottleIngest;
  readonly broker: Pick<BottleActionBroker, 'answer'>;
  readonly actions: Pick<BottleActions, 'run'>;
  readonly views: BottleReadDeps;
  readonly acts: ActDeps;
  readonly stats: Pick<StatsCache, 'invalidate'>;
  readonly now: () => Date;
}

async function bottleDeviceOf(roster: FleetRoster, deviceId: string): Promise<DeviceRow> {
  const { device, member } = await roster.lookup(deviceId);
  if (!member) {
    throw new ApiError('invalid_request', `${device.name} is not a water bottle.`);
  }
  return device;
}

export function viewerOf(caller: Caller): Viewer {
  return {
    clientId: caller.kind === 'client' ? caller.client.id : '',
    role: roleOfCaller(caller),
    profileId: profileIdOf(caller),
  };
}

async function reachable(deps: RouteDeps, deviceId: string, caller: Caller): Promise<DeviceRow> {
  const device = await bottleDeviceOf(deps.roster, deviceId);
  assertDeviceReach(deps.store, subjectOf(caller), deviceScopeOf(deps.store, caller), device);
  return device;
}

function defaultHolder(viewer: Viewer, config: ReturnType<typeof entryConfigOf>): boolean {
  return (
    config.binding.profileId === viewer.profileId ||
    (config.binding.profileId === null && viewer.role === 'owner')
  );
}

function wanted(
  deps: RouteDeps,
  context: { readonly client: ClientRow; readonly viewer: Viewer },
  target: { readonly device: DeviceRow; readonly config: ReturnType<typeof entryConfigOf> },
): boolean {
  const { device, config } = target;
  if (deps.bridges.holderOf(device)?.clientId === context.client.id) {
    return true;
  }
  return (
    deps.bridges.heldElsewhere(device, context.client) === null &&
    defaultHolder(context.viewer, config)
  );
}

async function mine(deps: RouteDeps, caller: Caller): Promise<PhoneBottles> {
  const client = clientOf(caller);
  const viewer = viewerOf(caller);
  const scope = deviceScopeOf(deps.store, caller);
  const chosen = deps.roster
    .members()
    .filter(
      ({ entry, device }) =>
        !deviceHidden(scope, device) &&
        wanted(deps, { client, viewer }, { device, config: entryConfigOf(entry) }),
    );
  const plans = await deps.store.host.read('bottlePlans', {
    targets: chosen.map(({ entry, device }) => ({ entry, deviceId: device.id })),
    now: deps.now().toISOString(),
  });
  const bottles = chosen.map(({ entry, device }, index) => {
    const plan = plans[index];
    if (plan === undefined) {
      throw new ApiError('internal', `No sync plan came back for ${device.id}.`);
    }
    return {
      deviceId: device.id,
      serial: entry.address,
      name: device.display_name ?? device.name,
      plan,
    };
  });
  return { bottles };
}

async function upload(
  deps: RouteDeps,
  deviceId: string,
  caller: Caller,
  body: Parameters<BottleIngest['process']>[2],
): Promise<Awaited<ReturnType<BottleIngest['process']>>> {
  const client: ClientRow = clientOf(caller);
  const device = await reachable(deps, deviceId, caller);
  const blocking = await deps.bridges.acquire(device, client);
  if (blocking !== null) {
    throw new ApiError(
      'conflict',
      `${blocking.clientName} syncs this bottle. Take over in the bottle settings to use this phone.`,
    );
  }
  const result = await deps.ingest.process(device, client, body);
  await deps.bridges.pair(device, client);
  deps.stats.invalidate();
  return result;
}

function setupOf(body: BottleAdd): Extract<LocalDeviceSetup, { driver: 'larq_bottle' }> {
  return { driver: 'larq_bottle', source: 'bluetooth', ...body };
}

async function add(deps: RouteDeps, caller: Caller, body: BottleAdd): Promise<DeviceRow> {
  const viewer = viewerOf(caller);
  if (viewer.role !== 'owner' && body.profileId !== viewer.profileId) {
    throw new ApiError('forbidden', 'You can add a bottle only for yourself.');
  }
  const device = await deps.local.add(setupOf(body));
  if (!deps.roster.has(device.external_id)) {
    await deps.roster.load();
  }
  const entry = deps.roster.entryOf(device.external_id);
  const config = entryConfigOf(entry);
  if (config.binding.profileId !== null) {
    deps.roster.use(
      await deps.store.host.write('localConfig', {
        externalId: entry.externalId,
        config: storedConfigOf({
          ...config,
          binding: { ...config.binding, boundBy: viewer.profileId },
        }),
      }),
    );
  }
  return device;
}

async function forget(deps: RouteDeps, deviceId: string, caller: Caller): Promise<void> {
  await deps.local.remove(await reachable(deps, deviceId, caller));
}

async function startUv(
  deps: RouteDeps,
  deviceId: string,
  caller: Caller,
  mode: 'normal' | 'adventure',
): Promise<BottleActResult> {
  if (caller.kind !== 'client' || caller.via !== undefined || caller.mcpOrigin !== undefined) {
    throw new ApiError('forbidden', 'A clean is started by a person at the bottle.');
  }
  const device = await reachable(deps, deviceId, caller);
  const entry = deps.roster.entryOf(device.external_id);
  const cap = await deps.store.host.read('bottleCap', {
    deviceId: device.id,
    now: deps.now().toISOString(),
  });
  const refusal = uvRefusalOf(cap);
  if (refusal !== null) {
    throw new ApiError('conflict', refusal);
  }
  return deps.actions.run(device, entry, 'uv_start', mode);
}

export function bottleRoutes(deps: RouteDeps): Routes<BottleEndpointName> {
  return {
    readPhoneBottles: bound(E.readPhoneBottles, ({ caller }) => mine(deps, caller)),
    uploadBottleSync: bound(E.uploadBottleSync, ({ params, body, caller }) =>
      upload(deps, params.deviceId, caller, body),
    ),
    answerBottleAction: bound(E.answerBottleAction, ({ body, caller }) => {
      const { requestId, ...result } = body;
      deps.broker.answer(clientOf(caller).id, requestId, result);
      return DONE_REPLY;
    }),
    addBottle: bound(E.addBottle, ({ body, caller }) => add(deps, caller, body)),
    forgetBottle: bound(E.forgetBottle, async ({ params, caller }) => {
      await forget(deps, params.deviceId, caller);
      return DONE_REPLY;
    }),
    readBottle: bound(E.readBottle, async ({ params, query, caller }) => {
      const device = await reachable(deps, params.deviceId, caller);
      const entry = deps.roster.entryOf(device.external_id);
      const viewer = viewerOf(caller);
      return readBottle(deps.views, { device, entry, viewer }, query);
    }),
    actBottle: bound(E.actBottle, async ({ params, body, caller }) => {
      const device = await reachable(deps, params.deviceId, caller);
      const actor: Actor = { ...viewerOf(caller), client: clientOf(caller) };
      return actBottle(deps.acts, device, actor, body);
    }),
    startBottleUv: bound(E.startBottleUv, ({ params, body, caller }) =>
      startUv(deps, params.deviceId, caller, body.mode),
    ),
  };
}
