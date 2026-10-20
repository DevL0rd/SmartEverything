import {
  API_ENDPOINTS as E,
  ApiError,
  AUDIO_STATE,
  DISPLAY_STATE,
  FILE_PLACES,
  FILE_PROPERTIES,
  FILE_SEARCH_RESULT,
  FILE_UPLOAD_RESULT,
  FILE_WRITE_RESULT,
  HISTORY_COLUMNS,
  PROCESS_DETAIL,
  SERVICES_STATE,
  STARTUP_STATE,
  SYSTEM_STATE,
  TILING_STATE,
  WINDOWS_STATE,
  displayChangeNeedsRevert,
  type HistoryBackfillRequest,
  type HistoryColumns,
  type HistoryQuery,
  type NodeRequest,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { SourceHistory } from '../metrics/source-history';
import type { Caller } from '../server/auth';
import { bound, DONE_REPLY, type Routes } from '../server/router';
import type { Store } from '../store/store';
import type { ComputerDirectory } from './computer-directory';
import type { ComputerDownloads } from './computer-downloads';
import type { ComputerService } from './computer-service';

export type ComputerSystemEndpointName =
  | 'readComputerAudio'
  | 'changeComputerAudio'
  | 'readComputerDisplays'
  | 'changeComputerDisplay'
  | 'confirmComputerDisplay'
  | 'readComputerSystem'
  | 'changeComputerSystem'
  | 'readComputerWindows'
  | 'changeComputerWindow'
  | 'readComputerTiling'
  | 'changeComputerTiling'
  | 'readComputerStartup'
  | 'changeComputerStartup'
  | 'readComputerServices'
  | 'changeComputerService'
  | 'readComputerProcess'
  | 'prioritiseComputerProcess'
  | 'searchComputerFiles'
  | 'readComputerFileProperties'
  | 'writeComputerFiles'
  | 'uploadComputerFile'
  | 'readComputerPlaces'
  | 'prepareComputerDownload'
  | 'readHistoryBackfill';

export interface ComputerSystemRouteOptions {
  readonly store: Pick<Store, 'devices'>;
  readonly service: ComputerService;
  readonly directory: ComputerDirectory;
  readonly downloads: Pick<ComputerDownloads, 'prepare'>;
  readonly sources: Pick<SourceHistory, 'backfill'>;
}

function queryOf(body: HistoryBackfillRequest): HistoryQuery {
  const { topics, maxPoints } = body;
  return 'sinceMs' in body
    ? { topics, maxPoints, sinceMs: body.sinceMs }
    : { topics, maxPoints, windowMs: body.windowMs };
}

async function pendingToken(
  options: ComputerSystemRouteOptions,
  caller: Caller,
  deviceId: string,
): Promise<string> {
  const known = options.directory.online(deviceId)?.view()?.parts.displays?.pendingRevert;
  const pending =
    known ??
    (await options.service.ask({ caller, deviceId, request: { verb: 'displays' } }, DISPLAY_STATE))
      .pendingRevert;
  if (pending === null) throw new ApiError('conflict', 'No screen change is waiting to be kept.');
  return pending.token;
}

function historyOf(
  options: ComputerSystemRouteOptions,
  caller: Caller,
  body: HistoryBackfillRequest,
): Promise<HistoryColumns> | HistoryColumns {
  const query = queryOf(body);
  if (options.store.devices.byId(body.device).kind !== 'computer') {
    return options.sources.backfill(body.device, query);
  }
  const request: NodeRequest = { verb: 'history', query };
  return options.service.ask({ caller, deviceId: body.device, request }, HISTORY_COLUMNS);
}

type Ask = <T>(
  caller: Caller,
  deviceId: string,
  request: NodeRequest,
  schema: z.ZodType<T>,
) => Promise<T>;

function askerOf(service: ComputerService): Ask {
  return (caller, deviceId, request, schema) => service.ask({ caller, deviceId, request }, schema);
}

type ScreenEndpointName =
  | 'readComputerAudio'
  | 'changeComputerAudio'
  | 'readComputerDisplays'
  | 'changeComputerDisplay'
  | 'confirmComputerDisplay';

function screenRoutes(options: ComputerSystemRouteOptions, ask: Ask): Routes<ScreenEndpointName> {
  return {
    readComputerAudio: bound(E.readComputerAudio, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'audio' }, AUDIO_STATE),
    ),
    changeComputerAudio: bound(E.changeComputerAudio, ({ params, body, caller }) =>
      ask(caller, params.deviceId, { verb: 'audio_set', change: body }, AUDIO_STATE),
    ),
    readComputerDisplays: bound(E.readComputerDisplays, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'displays' }, DISPLAY_STATE),
    ),
    changeComputerDisplay: bound(E.changeComputerDisplay, ({ params, body, caller }) => {
      const revert = displayChangeNeedsRevert(body);
      const request = { verb: 'display_set', change: body, revert } as const;
      return ask(caller, params.deviceId, request, DISPLAY_STATE);
    }),
    confirmComputerDisplay: bound(E.confirmComputerDisplay, async ({ params, body, caller }) => {
      const token = body.token ?? (await pendingToken(options, caller, params.deviceId));
      const request = { verb: 'display_confirm', token, keep: body.keep } as const;
      return ask(caller, params.deviceId, request, DISPLAY_STATE);
    }),
  };
}

type SettingEndpointName = Exclude<
  ComputerSystemEndpointName,
  FileEndpointName | ScreenEndpointName
>;

function settingRoutes(options: ComputerSystemRouteOptions, ask: Ask): Routes<SettingEndpointName> {
  return {
    readComputerSystem: bound(E.readComputerSystem, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'system' }, SYSTEM_STATE),
    ),
    changeComputerSystem: bound(E.changeComputerSystem, ({ params, body, caller }) =>
      ask(caller, params.deviceId, { verb: 'system_set', change: body }, SYSTEM_STATE),
    ),
    readComputerWindows: bound(E.readComputerWindows, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'windows' }, WINDOWS_STATE),
    ),
    changeComputerWindow: bound(E.changeComputerWindow, ({ params, body, caller }) =>
      ask(caller, params.deviceId, { verb: 'window_set', change: body }, WINDOWS_STATE),
    ),
    readComputerTiling: bound(E.readComputerTiling, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'tiling' }, TILING_STATE),
    ),
    changeComputerTiling: bound(E.changeComputerTiling, ({ params, body, caller }) =>
      ask(caller, params.deviceId, { verb: 'tiling_set', change: body }, TILING_STATE),
    ),
    readComputerStartup: bound(E.readComputerStartup, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'startup' }, STARTUP_STATE),
    ),
    changeComputerStartup: bound(E.changeComputerStartup, ({ params, body, caller }) =>
      ask(caller, params.deviceId, { verb: 'startup_set', change: body }, STARTUP_STATE),
    ),
    readComputerServices: bound(E.readComputerServices, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'services' }, SERVICES_STATE),
    ),
    changeComputerService: bound(
      E.changeComputerService,
      ({ params, body: { confirm, ...change }, caller }) =>
        options.service.ask(
          {
            caller,
            deviceId: params.deviceId,
            request: { verb: 'service_set', change },
            confirmed: confirm === true,
          },
          SERVICES_STATE,
        ),
    ),
    readHistoryBackfill: bound(E.readHistoryBackfill, async ({ body, caller }) => ({
      device: body.device,
      source: body.source,
      ...(await historyOf(options, caller, body)),
    })),
  };
}

type FileEndpointName =
  | 'readComputerProcess'
  | 'prioritiseComputerProcess'
  | 'searchComputerFiles'
  | 'readComputerFileProperties'
  | 'writeComputerFiles'
  | 'uploadComputerFile'
  | 'readComputerPlaces'
  | 'prepareComputerDownload';

function fileRoutes(options: ComputerSystemRouteOptions, ask: Ask): Routes<FileEndpointName> {
  return {
    readComputerProcess: bound(E.readComputerProcess, ({ params, caller }) =>
      ask(
        caller,
        params.deviceId,
        { verb: 'process_detail', pid: Number(params.pid) },
        PROCESS_DETAIL,
      ),
    ),
    prioritiseComputerProcess: bound(
      E.prioritiseComputerProcess,
      async ({ params, body, caller }) => {
        const request = { verb: 'priority', pid: Number(params.pid), nice: body.nice } as const;
        await ask(caller, params.deviceId, request, z.unknown());
        return DONE_REPLY;
      },
    ),
    searchComputerFiles: bound(E.searchComputerFiles, ({ params, query, caller }) => {
      const search = { path: query.path, text: query.text, cursor: query.cursor ?? null };
      return ask(
        caller,
        params.deviceId,
        { verb: 'files_search', query: search },
        FILE_SEARCH_RESULT,
      );
    }),
    readComputerFileProperties: bound(E.readComputerFileProperties, ({ params, query, caller }) =>
      ask(caller, params.deviceId, { verb: 'file_properties', path: query.path }, FILE_PROPERTIES),
    ),
    writeComputerFiles: bound(E.writeComputerFiles, ({ params, body, caller }) =>
      ask(caller, params.deviceId, { verb: 'file_write', change: body }, FILE_WRITE_RESULT),
    ),
    uploadComputerFile: bound(E.uploadComputerFile, ({ params, body, caller }) =>
      ask(caller, params.deviceId, { verb: 'file_upload', chunk: body }, FILE_UPLOAD_RESULT),
    ),
    readComputerPlaces: bound(E.readComputerPlaces, ({ params, caller }) =>
      ask(caller, params.deviceId, { verb: 'file_places' }, FILE_PLACES),
    ),
    prepareComputerDownload: bound(E.prepareComputerDownload, ({ params, body, caller }) =>
      options.downloads.prepare(caller, params.deviceId, body.paths),
    ),
  };
}

export function computerSystemRoutes(
  options: ComputerSystemRouteOptions,
): Routes<ComputerSystemEndpointName> {
  const ask = askerOf(options.service);
  return {
    ...screenRoutes(options, ask),
    ...settingRoutes(options, ask),
    ...fileRoutes(options, ask),
  };
}
