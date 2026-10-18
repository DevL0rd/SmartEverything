import { API_ENDPOINTS as E, CONNECT_LINK, PROCESS_LIST } from '@smarteverything/domain';
import { z } from 'zod';
import type { MetricHistory } from '../metrics/history';
import { bound, DONE_REPLY, type Routes } from '../server/router';
import type { Store } from '../store/store';
import { guarded } from './computer-access';
import type { ComputerDirectory } from './computer-directory';
import type { ComputerService } from './computer-service';
import type { ComputerSessionEndpointName } from './computer-session-routes';
import type { ComputerSystemEndpointName } from './computer-system-routes';

type ComputerCoreEndpointName =
  | 'readComputer'
  | 'readComputerMetrics'
  | 'listComputerLinks'
  | 'listComputerProcesses'
  | 'signalComputerProcess'
  | 'readComputerScopes'
  | 'updateComputerScopes';

export type ComputerEndpointName =
  ComputerCoreEndpointName | ComputerSessionEndpointName | ComputerSystemEndpointName;

const LINKS = z.array(CONNECT_LINK);

export interface ComputerRouteOptions {
  readonly store: Pick<Store, 'computerScopes'>;
  readonly service: ComputerService;
  readonly directory: ComputerDirectory;
  readonly history: Pick<MetricHistory, 'read'>;
}

export function computerRoutes(options: ComputerRouteOptions): Routes<ComputerCoreEndpointName> {
  const { directory, history, store, service } = options;
  const { access } = service;
  return {
    readComputer: bound(E.readComputer, ({ params, query, caller }) =>
      guarded(() =>
        query.fresh === true
          ? service.freshDetail(params.deviceId, service.viewer(caller))
          : service.detail(params.deviceId, service.viewer(caller)),
      ),
    ),
    listComputerLinks: bound(E.listComputerLinks, ({ params, caller }) =>
      guarded(async () => {
        access.device(params.deviceId, service.viewer(caller));
        const session = directory.online(params.deviceId);
        return session === null ? [] : LINKS.parse(await session.call({ verb: 'links' }));
      }),
    ),
    readComputerMetrics: bound(E.readComputerMetrics, ({ params, query, caller }) =>
      guarded(() => {
        access.require(params.deviceId, 'metrics', service.viewer(caller));
        return history.read(params.deviceId, query.capability, query.range);
      }),
    ),
    listComputerProcesses: bound(E.listComputerProcesses, ({ params, query, caller }) => {
      const request = { verb: 'processes', query } as const;
      return service.ask({ caller, deviceId: params.deviceId, request }, PROCESS_LIST);
    }),
    signalComputerProcess: bound(E.signalComputerProcess, async ({ params, body, caller }) => {
      const request = { verb: 'signal', pid: body.pid, signal: body.signal } as const;
      const call = { caller, deviceId: params.deviceId, request, confirmed: body.confirm === true };
      await service.ask(call, z.unknown());
      return DONE_REPLY;
    }),
    readComputerScopes: bound(E.readComputerScopes, ({ params, caller }) =>
      guarded(() => access.scopes(params.deviceId, service.viewer(caller))),
    ),
    updateComputerScopes: bound(E.updateComputerScopes, ({ params, body, caller }) =>
      guarded(() => {
        access.device(params.deviceId, service.viewer(caller));
        const scopes = store.computerScopes.update(params.deviceId, body);
        directory.online(params.deviceId)?.allow(scopes);
        return scopes;
      }),
    ),
  };
}
