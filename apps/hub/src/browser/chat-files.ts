import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { basename, join, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import mime from 'mime-types';
import parseRange from 'range-parser';
import { AI_PROJECT_PATH, ApiError, CHAT_FILES_PATH, chatFilesUrl } from '@smarteverything/domain';
import { isMissing } from '../fs-util';
import { projectCallerAuthority } from '../projects/authority';
import type { ProjectFilesService } from '../projects/service';
import { authenticate } from '../server/auth';
import type { RawRoute } from '../server/http-server';
import type { Store } from '../store/store';
import { pageHeaders } from './headers';

const INDEX = 'index.html';

export function projectRelative(path: string): string {
  const trimmed = path.replace(/^\/+/u, '').replace(/\/+$/u, '');
  const parsed = AI_PROJECT_PATH.safeParse(trimmed);
  if (!parsed.success)
    throw new ApiError(
      'invalid_request',
      'Give a file or folder inside this chat’s project, such as workspace/site or workspace/site/page.html.',
    );
  return parsed.data;
}

async function contained(root: string, relative: string): Promise<string | null> {
  try {
    const base = await realpath(root);
    const real = await realpath(join(root, relative));
    if (real !== base && !real.startsWith(`${base}${sep}`))
      throw new ApiError('forbidden', 'That path leaves this chat’s project folder.');
    return real;
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}

export async function chatPagePath(
  projects: Pick<ProjectFilesService, 'root'>,
  chatId: string,
  path: string,
): Promise<string> {
  const relative = projectRelative(path);
  const real = await contained(projects.root(chatId), relative);
  if (real === null)
    throw new ApiError('not_found', `There is no ${relative} in this chat’s project.`);
  const info = await stat(real);
  if (info.isFile()) return `/${relative}`;
  if (!info.isDirectory())
    throw new ApiError('forbidden', 'Only files and folders of the project can be opened.');
  const index = await contained(projects.root(chatId), `${relative}/${INDEX}`);
  if (index === null || !(await stat(index)).isFile())
    throw new ApiError('not_found', `The folder ${relative} has no ${INDEX} to open.`);
  return `/${relative}/${INDEX}`;
}

function decodedPath(raw: string): string {
  try {
    return raw.split('/').map(decodeURIComponent).join('/');
  } catch {
    throw new ApiError('invalid_request', 'The page path is not valid URL encoding.');
  }
}

function contentType(path: string): string {
  const type = mime.contentType(basename(path));
  return type === false ? 'application/octet-stream' : type;
}

async function serveFile(
  request: IncomingMessage,
  response: ServerResponse,
  file: { readonly real: string; readonly size: number },
): Promise<void> {
  const ranges = request.headers.range === undefined ? -2 : parseRange(file.size, request.headers.range);
  if (ranges === -1) {
    response.writeHead(416, { 'content-range': `bytes */${String(file.size)}`, 'content-length': 0 });
    response.end();
    return;
  }
  const range =
    ranges === -2 || ranges.type !== 'bytes' || ranges.length !== 1 ? undefined : ranges[0];
  const start = range?.start ?? 0;
  const end = range?.end ?? file.size - 1;
  response.writeHead(range === undefined ? 200 : 206, {
    ...pageHeaders(["'none'"]),
    'content-type': contentType(file.real),
    'content-length': Math.max(0, end - start + 1),
    'accept-ranges': 'bytes',
    ...(range === undefined
      ? {}
      : { 'content-range': `bytes ${String(start)}-${String(end)}/${String(file.size)}` }),
  });
  if (request.method === 'HEAD' || file.size === 0) {
    response.end();
    return;
  }
  await pipeline(createReadStream(file.real, { start, end }), response);
}

export async function serveChatFile(
  projects: Pick<ProjectFilesService, 'root'>,
  exchange: { readonly request: IncomingMessage; readonly response: ServerResponse },
  input: { readonly chatId: string; readonly raw: string },
): Promise<void> {
  const { request, response } = exchange;
  const path = decodedPath(input.raw);
  const relative = projectRelative(path);
  const real = await contained(projects.root(input.chatId), relative);
  if (real === null) throw new ApiError('not_found', `There is no ${relative} in this project.`);
  const info = await stat(real);
  if (info.isDirectory()) {
    if (!path.endsWith('/')) {
      response.writeHead(307, {
        location: chatFilesUrl(input.chatId, `/${relative}/`),
        'cache-control': 'no-store',
      });
      response.end();
      return;
    }
    await serveChatFile(projects, exchange, { ...input, raw: `${input.raw}${INDEX}` });
    return;
  }
  if (!info.isFile()) throw new ApiError('forbidden', 'Only regular project files are served.');
  await serveFile(request, response, { real, size: info.size });
}

export function chatFileRoutes(store: Store, projects: ProjectFilesService): readonly RawRoute[] {
  return (['GET', 'HEAD'] as const).map((method) => ({
    method,
    path: CHAT_FILES_PATH,
    handle: async (request, response, params): Promise<void> => {
      const caller = authenticate(store, request, 'member', false);
      const chatId = params['chatId'] ?? '';
      projectCallerAuthority(store, caller, chatId);
      await serveChatFile(projects, { request, response }, { chatId, raw: params['path'] ?? '' });
    },
  }));
}
