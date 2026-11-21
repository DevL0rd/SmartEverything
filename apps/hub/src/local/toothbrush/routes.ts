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
import type { WatchBridges } from '../watch-bridge';
import type { Viewer } from './access';
import { actBrush, type ActDeps, type Actor } from './acts';
import type { BrushActionBroker } from './broker';
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
  readonly bridges: Pick<WatchBridges, 'acquire' | 'heldElsewhere' | 'pair'>;
  readonly ingest: BrushIngest;
  readonly broker: Pick<BrushActionBroker, 'answer'>;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
  readonly now: () => Date;
}

async function brushDeviceOf(fleet: Fleet, deviceId: string): Promise<DeviceRow> {
  const { device, member } = await fleet.roster.lookup(deviceId);
  if (!member) {
    throw new ApiError('invalid_request', `${device.name} is not a toothbrush.`);
  }
  await fleet.ensure(device);
  return device;
}

async function reachable(deps: RouteDeps, deviceId: string, caller: Caller): Promise<DeviceRow> {
  const device = await brushDeviceOf(deps.fleet, deviceId);
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

function viewerOf(caller: Caller): Viewer {
  return {
    clientId: caller.kind === 'client' ? caller.client.id : '',
    role: roleOfCaller(caller),
    profileId: profileIdOf(caller),
  };
}

async function mine(deps: RouteDeps, caller: Caller): Promise<PhoneBrushes> {
  const client = clientOf(caller);
  const scope = deviceScopeOf(deps.store, caller);
  const devices = deps.fleet.roster
    .members()
    .map(({ device }) => device)
    .filter((device) => !deviceHidden(scope, device));
  const brushes = await Promise.all(
    devices.map(async (device) => {
      const state = await deps.fleet.ensure(device);
      return state.runtime.definition.plan(
        device,
        state,
        deps.bridges.heldElsewhere(device, client) === null,
        deps.now(),
      );
    }),
  );
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
  const device = await reachable(deps, deviceId, caller);
  const blocking = await deps.bridges.acquire(device, client);
  if (blocking !== null) {
    throw new ApiError(
      'conflict',
      `${blocking.clientName} holds the Bluetooth link to this toothbrush. Take over in the toothbrush settings to use it here.`,
    );
  }
  const result = await deps.ingest.process(device, client, body);
  if (body.link.phase === 'linked') {
    await deps.bridges.pair(device, client);
  }
  return result;
}

function actorOf(caller: Caller): Actor {
  return { ...viewerOf(caller), client: clientOf(caller), phone: phoneOf(caller) };
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
    readToothbrush: bound(E.readToothbrush, async ({ params, query, caller }) =>
      readBrush(
        deps.views,
        await reachable(deps, params.deviceId, caller),
        viewerOf(caller),
        query,
      ),
    ),
    actToothbrush: bound(E.actToothbrush, async ({ params, body, caller }) =>
      actBrush(deps.acts, await reachable(deps, params.deviceId, caller), actorOf(caller), body),
    ),
  };
}
