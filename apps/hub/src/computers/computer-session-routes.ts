import {
  API_ENDPOINTS as E,
  APP_CLOSED,
  COMPUTER_CAPTURE,
  FILE_CONTENT,
  FILE_LIST,
  INSTALLED_APP,
  type ComputerApps,
  type ComputerScope,
  type NodeRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import { bound, DONE_REPLY, type Bound } from '../server/router';
import type { Store } from '../store/store';
import { ComputerAccess, guarded } from './computer-access';
import type { ComputerDirectory } from './computer-directory';

export type ComputerSessionEndpointName =
  | 'listComputerApps'
  | 'openComputerApp'
  | 'closeComputerApp'
  | 'listComputerFiles'
  | 'readComputerFile'
  | 'captureComputer';

const INSTALLED = z.array(INSTALLED_APP);
const DAY_MS = 86_400_000;
const WEEK_DAYS = 7;

export interface ComputerSessionRouteOptions {
  readonly store: Pick<Store, 'devices' | 'computerScopes' | 'appSessions'>;
  readonly directory: ComputerDirectory;
  readonly now: () => Date;
}

function startOfDay(now: Date): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

async function appsOf(
  options: ComputerSessionRouteOptions,
  deviceId: string,
): Promise<ComputerApps> {
  const session = options.directory.byDevice(deviceId);
  const installed = INSTALLED.parse(await session.call({ verb: 'apps' }));
  const today = startOfDay(options.now());
  return {
    installed,
    focused: session.view()?.session?.focused ?? null,
    today: options.store.appSessions.usage(deviceId, today),
    week: options.store.appSessions.usage(
      deviceId,
      new Date(today.getTime() - (WEEK_DAYS - 1) * DAY_MS),
    ),
  };
}

export function computerSessionRoutes(
  options: ComputerSessionRouteOptions,
): Record<ComputerSessionEndpointName, Bound> {
  const access = new ComputerAccess(options.store);
  const ask = (deviceId: string, scope: ComputerScope, request: NodeRequest): Promise<unknown> => {
    access.require(deviceId, scope);
    return options.directory.byDevice(deviceId).call(request);
  };
  return {
    listComputerApps: bound(E.listComputerApps, ({ params }) =>
      guarded(() => {
        access.require(params.deviceId, 'apps');
        return appsOf(options, params.deviceId);
      }),
    ),
    openComputerApp: bound(E.openComputerApp, ({ params, body }) =>
      guarded(async () => {
        await ask(params.deviceId, 'apps', { verb: 'open_app', appId: body.appId });
        return DONE_REPLY;
      }),
    ),
    closeComputerApp: bound(E.closeComputerApp, ({ params, body }) =>
      guarded(async () => {
        const request: NodeRequest = { verb: 'close_app', appId: body.appId, force: body.force };
        return APP_CLOSED.parse(await ask(params.deviceId, 'apps', request));
      }),
    ),
    listComputerFiles: bound(E.listComputerFiles, ({ params, query }) =>
      guarded(async () => {
        const request: NodeRequest = { verb: 'files', path: query.path ?? null };
        return FILE_LIST.parse(await ask(params.deviceId, 'files', request));
      }),
    ),
    readComputerFile: bound(E.readComputerFile, ({ params, query }) =>
      guarded(async () => {
        const request: NodeRequest = { verb: 'file', path: query.path };
        return FILE_CONTENT.parse(await ask(params.deviceId, 'files', request));
      }),
    ),
    captureComputer: bound(E.captureComputer, ({ params, body }) =>
      guarded(async () => {
        const request: NodeRequest = { verb: 'capture', target: body.target };
        return COMPUTER_CAPTURE.parse(await ask(params.deviceId, 'screenshots', request));
      }),
    ),
  };
}
