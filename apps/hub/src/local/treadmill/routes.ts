import {
  API_ENDPOINTS as E,
  ApiError,
  type ClientRow,
  type DeviceRow,
  type PhoneTreadmills,
  type TreadmillBatchResult,
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
import type { LocalDevices } from '../local-devices';
import type { WatchBridges } from '../watch-bridge';
import { actTreadmill, type ActDeps, type Actor } from './acts';
import type { TreadmillActionBroker } from './broker';
import { TREADMILL_DRIVER } from './config';
import type { Fleet } from './fleet';
import type { TreadmillIngest } from './ingest';
import { planOf } from './plan';
import { readTreadmill, type ViewDeps, type Viewer } from './views';

export type TreadmillEndpointName =
  | 'readPhoneTreadmills'
  | 'reportTreadmillFrames'
  | 'answerTreadmillAction'
  | 'readTreadmill'
  | 'actTreadmill';

export interface RouteDeps {
  readonly store: Store;
  readonly fleet: Fleet;
  readonly local: Pick<LocalDevices, 'deviceOf'>;
  readonly bridges: Pick<WatchBridges, 'acquire' | 'heldElsewhere'>;
  readonly ingest: TreadmillIngest;
  readonly broker: Pick<TreadmillActionBroker, 'answer'>;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
  readonly afterReport: (device: DeviceRow) => void;
  readonly now: () => Date;
}

function treadmillDeviceOf(
  store: Pick<Store, 'devices' | 'localDevices'>,
  deviceId: string,
): DeviceRow {
  const device = store.devices.byId(deviceId);
  const isTreadmill =
    device.provider === 'local' &&
    store.localDevices
      .list()
      .some(
        (entry) => entry.externalId === device.external_id && entry.driver === TREADMILL_DRIVER,
      );
  if (!isTreadmill) {
    throw new ApiError('invalid_request', `${device.name} is not a treadmill.`);
  }
  return device;
}

function reachable(deps: RouteDeps, deviceId: string, caller: Caller): DeviceRow {
  const device = treadmillDeviceOf(deps.store, deviceId);
  assertDeviceReach(deps.store, subjectOf(caller), deviceScopeOf(deps.store, caller), device);
  return device;
}

function phoneOf(caller: Caller): boolean {
  return (
    caller.kind === 'client' &&
    caller.client.platform === 'android' &&
    caller.via === undefined &&
    caller.mcpOrigin === undefined &&
    caller.authority === undefined
  );
}

function viewerOf(store: Store, caller: Caller): Viewer {
  return {
    clientId: caller.kind === 'client' ? caller.client.id : '',
    role: roleOfCaller(caller),
    profileId: profileIdOf(store, caller),
  };
}

function mine(deps: RouteDeps, caller: Caller): PhoneTreadmills {
  const client = clientOf(caller);
  const scope = deviceScopeOf(deps.store, caller);
  const treadmills = deps.store.localDevices
    .list()
    .filter((entry) => entry.driver === TREADMILL_DRIVER)
    .flatMap((entry) => {
      const device = deps.local.deviceOf(entry);
      return device === undefined || deviceHidden(scope, device) ? [] : [device];
    })
    .map((device) =>
      planOf(
        device,
        deps.fleet.of(device),
        deps.bridges.heldElsewhere(device, client) === null,
        deps.now(),
      ),
    );
  return { treadmills };
}

async function report(
  deps: RouteDeps,
  deviceId: string,
  caller: Caller,
  body: Parameters<TreadmillIngest['process']>[2],
): Promise<TreadmillBatchResult> {
  const client: ClientRow = clientOf(caller);
  const device = reachable(deps, deviceId, caller);
  const blocking = await deps.bridges.acquire(device, client);
  if (blocking !== null) {
    throw new ApiError(
      'conflict',
      `${blocking.clientName} holds the Bluetooth link to this treadmill. Take over in the treadmill settings to use it here.`,
    );
  }
  const result = deps.ingest.process(device, client, body);
  deps.afterReport(device);
  return result;
}

function actorOf(deps: RouteDeps, caller: Caller): Actor {
  return { ...viewerOf(deps.store, caller), client: clientOf(caller), phone: phoneOf(caller) };
}

export function treadmillRoutes(deps: RouteDeps): Routes<TreadmillEndpointName> {
  return {
    readPhoneTreadmills: bound(E.readPhoneTreadmills, ({ caller }) => mine(deps, caller)),
    reportTreadmillFrames: bound(E.reportTreadmillFrames, ({ params, body, caller }) =>
      report(deps, params.deviceId, caller, body),
    ),
    answerTreadmillAction: bound(E.answerTreadmillAction, ({ body, caller }) => {
      const { requestId, ...result } = body;
      deps.broker.answer(clientOf(caller).id, requestId, result);
      return DONE_REPLY;
    }),
    readTreadmill: bound(E.readTreadmill, ({ params, query, caller }) =>
      readTreadmill(
        deps.views,
        reachable(deps, params.deviceId, caller),
        viewerOf(deps.store, caller),
        query,
      ),
    ),
    actTreadmill: bound(E.actTreadmill, ({ params, body, caller }) =>
      actTreadmill(
        deps.acts,
        reachable(deps, params.deviceId, caller),
        actorOf(deps, caller),
        body,
      ),
    ),
  };
}
