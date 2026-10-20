import {
  API_ENDPOINTS as E,
  ApiError,
  type ClientRow,
  type DeviceRow,
  type PhoneBrushes,
  type BrushBatchResult,
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
import type { Viewer } from './access';
import { actBrush, type ActDeps, type Actor } from './acts';
import type { BrushActionBroker } from './broker';
import { isBrushEntry } from './brands';
import type { Fleet } from './fleet';
import type { BrushIngest } from './ingest';
import { readBrush, type ViewDeps } from './views';

export type BrushEndpointName =
  | 'readPhoneBrushes'
  | 'reportBrushFrames'
  | 'answerBrushAction'
  | 'readToothbrush'
  | 'actToothbrush';

export interface RouteDeps {
  readonly store: Store;
  readonly fleet: Fleet;
  readonly local: Pick<LocalDevices, 'deviceOf'>;
  readonly bridges: Pick<WatchBridges, 'acquire' | 'heldElsewhere'>;
  readonly ingest: BrushIngest;
  readonly broker: Pick<BrushActionBroker, 'answer'>;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
  readonly now: () => Date;
}

function brushDeviceOf(
  store: Pick<Store, 'devices' | 'localDevices'>,
  deviceId: string,
): DeviceRow {
  const device = store.devices.byId(deviceId);
  const isBrush =
    device.provider === 'local' &&
    store.localDevices
      .list()
      .some((entry) => entry.externalId === device.external_id && isBrushEntry(entry));
  if (!isBrush) {
    throw new ApiError('invalid_request', `${device.name} is not a toothbrush.`);
  }
  return device;
}

function reachable(deps: RouteDeps, deviceId: string, caller: Caller): DeviceRow {
  const device = brushDeviceOf(deps.store, deviceId);
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

function mine(deps: RouteDeps, caller: Caller): PhoneBrushes {
  const client = clientOf(caller);
  const scope = deviceScopeOf(deps.store, caller);
  const brushes = deps.store.localDevices
    .list()
    .filter((entry) => isBrushEntry(entry))
    .flatMap((entry) => {
      const device = deps.local.deviceOf(entry);
      return device === undefined || deviceHidden(scope, device) ? [] : [device];
    })
    .map((device) => {
      const state = deps.fleet.of(device);
      return state.runtime.definition.plan(
        device,
        state,
        deps.bridges.heldElsewhere(device, client) === null,
        deps.now(),
      );
    });
  return { brushes };
}

async function report(
  deps: RouteDeps,
  deviceId: string,
  caller: Caller,
  body: Parameters<BrushIngest['process']>[2],
): Promise<BrushBatchResult> {
  const client: ClientRow = clientOf(caller);
  if (!phoneOf(caller)) {
    throw new ApiError('forbidden', 'Only a phone can report the toothbrush Bluetooth link.');
  }
  const device = reachable(deps, deviceId, caller);
  const blocking = await deps.bridges.acquire(device, client);
  if (blocking !== null) {
    throw new ApiError(
      'conflict',
      `${blocking.clientName} holds the Bluetooth link to this toothbrush. Take over in the toothbrush settings to use it here.`,
    );
  }
  return deps.ingest.process(device, client, body);
}

function actorOf(deps: RouteDeps, caller: Caller): Actor {
  return { ...viewerOf(deps.store, caller), client: clientOf(caller), phone: phoneOf(caller) };
}

export function brushRoutes(deps: RouteDeps): Routes<BrushEndpointName> {
  return {
    readPhoneBrushes: bound(E.readPhoneBrushes, ({ caller }) => mine(deps, caller)),
    reportBrushFrames: bound(E.reportBrushFrames, ({ params, body, caller }) =>
      report(deps, params.deviceId, caller, body),
    ),
    answerBrushAction: bound(E.answerBrushAction, ({ body, caller }) => {
      const { requestId, ...result } = body;
      deps.broker.answer(clientOf(caller).id, requestId, result);
      return DONE_REPLY;
    }),
    readToothbrush: bound(E.readToothbrush, ({ params, query, caller }) =>
      readBrush(
        deps.views,
        reachable(deps, params.deviceId, caller),
        viewerOf(deps.store, caller),
        query,
      ),
    ),
    actToothbrush: bound(E.actToothbrush, ({ params, body, caller }) =>
      actBrush(deps.acts, reachable(deps, params.deviceId, caller), actorOf(deps, caller), body),
    ),
  };
}
