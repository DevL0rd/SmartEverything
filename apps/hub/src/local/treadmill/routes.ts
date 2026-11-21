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
import type { WatchBridges } from '../watch-bridge';
import { actTreadmill, type ActDeps, type Actor } from './acts';
import type { TreadmillActionBroker } from './broker';
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
  readonly bridges: Pick<WatchBridges, 'acquire' | 'heldElsewhere' | 'pair'>;
  readonly ingest: TreadmillIngest;
  readonly broker: Pick<TreadmillActionBroker, 'answer'>;
  readonly views: ViewDeps;
  readonly acts: ActDeps;
  readonly afterReport: (device: DeviceRow) => void;
  readonly now: () => Date;
}

async function treadmillDeviceOf(fleet: Fleet, deviceId: string): Promise<DeviceRow> {
  const { device, member } = await fleet.roster.lookup(deviceId);
  if (!member) {
    throw new ApiError('invalid_request', `${device.name} is not a treadmill.`);
  }
  await fleet.ensure(device);
  return device;
}

async function reachable(deps: RouteDeps, deviceId: string, caller: Caller): Promise<DeviceRow> {
  const device = await treadmillDeviceOf(deps.fleet, deviceId);
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

function mine(deps: RouteDeps, caller: Caller): PhoneTreadmills {
  const client = clientOf(caller);
  const scope = deviceScopeOf(deps.store, caller);
  const treadmills = deps.fleet.roster
    .members()
    .map(({ device }) => device)
    .filter((device) => !deviceHidden(scope, device))
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
  const device = await reachable(deps, deviceId, caller);
  const blocking = await deps.bridges.acquire(device, client);
  if (blocking !== null) {
    throw new ApiError(
      'conflict',
      `${blocking.clientName} holds the Bluetooth link to this treadmill. Take over in the treadmill settings to use it here.`,
    );
  }
  const result = await deps.ingest.process(device, client, body);
  if (body.link.phase === 'linked') {
    await deps.bridges.pair(device, client);
  }
  deps.afterReport(device);
  return result;
}

function actorOf(caller: Caller): Actor {
  return { ...viewerOf(caller), client: clientOf(caller), phone: phoneOf(caller) };
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
    readTreadmill: bound(E.readTreadmill, async ({ params, query, caller }) =>
      readTreadmill(
        deps.views,
        await reachable(deps, params.deviceId, caller),
        viewerOf(caller),
        query,
      ),
    ),
    actTreadmill: bound(E.actTreadmill, async ({ params, body, caller }) =>
      actTreadmill(
        deps.acts,
        await reachable(deps, params.deviceId, caller),
        actorOf(caller),
        body,
      ),
    ),
  };
}
