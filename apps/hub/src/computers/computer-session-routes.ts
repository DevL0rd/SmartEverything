import {
  API_ENDPOINTS as E,
  APP_CLOSED,
  COMPUTER_CAPTURE,
  FILE_CONTENT,
  FILE_LIST,
  INSTALLED_APP,
  type ComputerApps,
  localClock,
  shiftedDate,
  zonedInstant,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Caller } from '../server/auth';
import { bound, DONE_REPLY, type Routes } from '../server/router';
import type { Store } from '../store/store';
import type { ComputerDirectory } from './computer-directory';
import type { ComputerService } from './computer-service';

export type ComputerSessionEndpointName =
  | 'listComputerApps'
  | 'openComputerApp'
  | 'closeComputerApp'
  | 'listComputerFiles'
  | 'readComputerFile'
  | 'captureComputer';

const INSTALLED = z.array(INSTALLED_APP);
const WEEK_DAYS = 7;

export interface ComputerSessionRouteOptions {
  readonly store: Pick<Store, 'appSessions' | 'settings'>;
  readonly service: ComputerService;
  readonly directory: ComputerDirectory;
  readonly now: () => Date;
}

export function periodStarts(
  now: Date,
  zone: string,
): { readonly today: Date; readonly week: Date } {
  const clock = localClock(now, zone);
  return {
    today: zonedInstant(clock, 0, zone),
    week: zonedInstant(shiftedDate(clock, 1 - WEEK_DAYS), 0, zone),
  };
}

async function appsOf(
  options: ComputerSessionRouteOptions,
  caller: Caller,
  deviceId: string,
): Promise<ComputerApps> {
  const installed = await options.service.ask(
    { caller, deviceId, request: { verb: 'apps' } },
    INSTALLED,
  );
  const { today, week } = periodStarts(options.now(), options.store.settings.read().time_zone);
  return {
    installed,
    focused: options.directory.online(deviceId)?.view()?.parts.session?.focused ?? null,
    today: options.store.appSessions.usage(deviceId, today),
    week: options.store.appSessions.usage(deviceId, week),
  };
}

export function computerSessionRoutes(
  options: ComputerSessionRouteOptions,
): Routes<ComputerSessionEndpointName> {
  const { service } = options;
  return {
    listComputerApps: bound(E.listComputerApps, ({ params, caller }) =>
      appsOf(options, caller, params.deviceId),
    ),
    openComputerApp: bound(E.openComputerApp, async ({ params, body, caller }) => {
      const request = { verb: 'open_app', appId: body.appId } as const;
      await service.ask({ caller, deviceId: params.deviceId, request }, z.unknown());
      return DONE_REPLY;
    }),
    closeComputerApp: bound(E.closeComputerApp, ({ params, body, caller }) => {
      const request = { verb: 'close_app', appId: body.appId, force: body.force } as const;
      return service.ask({ caller, deviceId: params.deviceId, request }, APP_CLOSED);
    }),
    listComputerFiles: bound(E.listComputerFiles, ({ params, query, caller }) => {
      const request = { verb: 'files', path: query.path ?? null, cursor: query.cursor } as const;
      return service.ask({ caller, deviceId: params.deviceId, request }, FILE_LIST);
    }),
    readComputerFile: bound(E.readComputerFile, ({ params, query, caller }) => {
      const request = { verb: 'file', path: query.path } as const;
      return service.ask({ caller, deviceId: params.deviceId, request }, FILE_CONTENT);
    }),
    captureComputer: bound(E.captureComputer, ({ params, body, caller }) => {
      const request = { verb: 'capture', target: body.target } as const;
      return service.ask({ caller, deviceId: params.deviceId, request }, COMPUTER_CAPTURE);
    }),
  };
}
