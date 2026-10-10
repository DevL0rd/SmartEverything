import {
  API_ENDPOINTS as E,
  COMPUTER_ACTIONS,
  CONNECT_LINK,
  PROCESS_LIST,
  type ComputerAction,
  type ComputerDetail,
  type ComputerScopes,
  type ComputerSessionState,
  type NodeRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { MetricHistory } from '../metrics/history';
import { bound, DONE_REPLY, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { ComputerAccess, guarded } from './computer-access';
import type { ComputerDirectory } from './computer-directory';
import type { ComputerSessionEndpointName } from './computer-session-routes';

type ComputerCoreEndpointName =
  | 'readComputer'
  | 'readComputerMetrics'
  | 'listComputerProcesses'
  | 'signalComputerProcess'
  | 'readComputerScopes'
  | 'updateComputerScopes';

export type ComputerEndpointName = ComputerCoreEndpointName | ComputerSessionEndpointName;

const LINKS = z.array(CONNECT_LINK);

const ACTIONS: ReadonlySet<string> = new Set(COMPUTER_ACTIONS);

export interface ComputerRouteOptions {
  readonly store: Pick<Store, 'devices' | 'computerScopes'>;
  readonly directory: ComputerDirectory;
  readonly history: Pick<MetricHistory, 'read'>;
}

function isAction(key: string): key is ComputerAction {
  return ACTIONS.has(key);
}

function visibleSession(
  session: ComputerSessionState | null,
  scopes: ComputerScopes,
): ComputerSessionState | null {
  if (session === null || scopes.apps) {
    return session;
  }
  return { ...session, focused: null };
}

async function detailOf(
  access: ComputerAccess,
  directory: ComputerDirectory,
  deviceId: string,
): Promise<ComputerDetail> {
  const device = access.device(deviceId);
  const scopes = access.scopes(deviceId);
  const session = directory.online(deviceId);
  const view = session?.view() ?? null;
  const links = session === null ? [] : LINKS.parse(await session.call({ verb: 'links' }));
  return {
    deviceId,
    online: device.online,
    snapshot: scopes.metrics && view !== null ? view.snapshot : null,
    session: visibleSession(view?.session ?? null, scopes),
    scopes,
    actions: device.capabilities.map((capability) => capability.key).filter(isAction),
    links,
  };
}

export function computerRoutes(
  options: ComputerRouteOptions,
): Record<ComputerCoreEndpointName, Bound> {
  const access = new ComputerAccess(options.store);
  const { directory, history, store } = options;
  return {
    readComputer: bound(E.readComputer, ({ params }) =>
      guarded(() => detailOf(access, directory, params.deviceId)),
    ),
    readComputerMetrics: bound(E.readComputerMetrics, ({ params, query }) =>
      guarded(() => {
        access.require(params.deviceId, 'metrics');
        return history.read(params.deviceId, query.capability, query.range);
      }),
    ),
    listComputerProcesses: bound(E.listComputerProcesses, ({ params, query }) =>
      guarded(async () => {
        access.require(params.deviceId, 'processes');
        const value = await directory.byDevice(params.deviceId).call({ verb: 'processes', query });
        return PROCESS_LIST.parse(value);
      }),
    ),
    signalComputerProcess: bound(E.signalComputerProcess, ({ params, body }) =>
      guarded(async () => {
        access.require(params.deviceId, 'processes');
        const request: NodeRequest = { verb: 'signal', pid: body.pid, signal: body.signal };
        await directory.byDevice(params.deviceId).call(request);
        return DONE_REPLY;
      }),
    ),
    readComputerScopes: bound(E.readComputerScopes, ({ params }) =>
      guarded(() => access.scopes(params.deviceId)),
    ),
    updateComputerScopes: bound(E.updateComputerScopes, ({ params, body }) =>
      guarded(() => {
        access.device(params.deviceId);
        const scopes = store.computerScopes.update(params.deviceId, body);
        directory.online(params.deviceId)?.allow(scopes);
        return scopes;
      }),
    ),
  };
}
