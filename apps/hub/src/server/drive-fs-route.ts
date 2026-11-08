import type { IncomingMessage } from 'node:http';
import { ApiError } from '@smarteverything/domain';
import { z } from 'zod';
import {
  FS_LIST_QUERY,
  FS_MKDIR,
  FS_REMOVE,
  FS_RENAME,
  FS_STAT_QUERY,
  FS_UTIMENS,
  type DriveFsApi,
  type FsCaller,
} from '../drive/fs-api';
import { serveDriveFile, type DriveFiles } from './drive-files';
import { PUBLIC_BODY_LIMIT, bearerOf, parseJsonBody, readBody, sendJson } from './http';
import type { RawRoute } from './http-server';

export const DRIVE_FS_PATH = '/drive/fs/:rootId';

export interface DriveFsRouteEnv {
  readonly api: DriveFsApi;
  readonly files: DriveFiles;
}

interface Exchange {
  readonly caller: FsCaller;
  readonly rootId: string;
  readonly request: IncomingMessage;
}

type Action = (exchange: Exchange) => unknown;

function callerOf(env: DriveFsRouteEnv, request: IncomingMessage): FsCaller {
  const node = env.files.nodes.authenticate(bearerOf(request));
  return { ...env.files.nodes.actorOf(node), nodeId: node.device_id };
}

const READ_QUERY = z.looseObject({ base: z.uuid().optional() });

function parsed<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ApiError('invalid_request', result.error.issues[0]?.message ?? 'Invalid request.');
  }
  return result.data;
}

function queryOf(request: IncomingMessage): Record<string, string> {
  const { searchParams } = new URL(request.url ?? '/', 'http://drive');
  return Object.fromEntries(searchParams);
}

async function bodyOf(request: IncomingMessage): Promise<unknown> {
  return parseJsonBody(request, await readBody(request, PUBLIC_BODY_LIMIT));
}

function route(
  env: DriveFsRouteEnv,
  method: 'GET' | 'POST',
  action: string,
  run: Action,
): RawRoute {
  return {
    method,
    path: `${DRIVE_FS_PATH}/${action}`,
    handle: async (request, response, params): Promise<void> => {
      const caller = callerOf(env, request);
      const result: unknown = await run({ caller, rootId: params['rootId'] ?? '', request });
      sendJson(response, 200, result ?? {});
    },
  };
}

function readRoute(env: DriveFsRouteEnv): RawRoute {
  return {
    method: 'GET',
    path: `${DRIVE_FS_PATH}/read/:itemId`,
    handle: async (request, response, params): Promise<void> => {
      const caller = callerOf(env, request);
      const itemId = params['itemId'] ?? '';
      const { base } = parsed(READ_QUERY, queryOf(request));
      env.api.readable(caller, params['rootId'] ?? '', itemId, base);
      const url = new URL(request.url ?? '/', 'http://drive');
      await serveDriveFile(env.files, { request, response, url }, itemId);
    },
  };
}

export function driveFsRoutes(env: DriveFsRouteEnv): readonly RawRoute[] {
  const { api } = env;
  return [
    readRoute(env),
    route(env, 'GET', 'list', ({ caller, rootId, request }) =>
      api.list(caller, rootId, parsed(FS_LIST_QUERY, queryOf(request))),
    ),
    route(env, 'GET', 'stat', ({ caller, rootId, request }) => ({
      entry: api.stat(caller, rootId, parsed(FS_STAT_QUERY, queryOf(request))),
    })),
    route(env, 'POST', 'mkdir', async ({ caller, rootId, request }) =>
      api.mkdir(caller, rootId, parsed(FS_MKDIR, await bodyOf(request))),
    ),
    route(env, 'POST', 'rename', async ({ caller, rootId, request }) =>
      api.rename(caller, rootId, parsed(FS_RENAME, await bodyOf(request))),
    ),
    route(env, 'POST', 'unlink', async ({ caller, rootId, request }) =>
      api.unlink(caller, rootId, parsed(FS_REMOVE, await bodyOf(request))),
    ),
    route(env, 'POST', 'rmdir', async ({ caller, rootId, request }) =>
      api.rmdir(caller, rootId, parsed(FS_REMOVE, await bodyOf(request))),
    ),
    route(env, 'POST', 'utimens', async ({ caller, rootId, request }) =>
      api.utimens(caller, rootId, parsed(FS_UTIMENS, await bodyOf(request))),
    ),
  ];
}
