import { opendir } from 'node:fs/promises';
import {
  ApiError,
  AI_PROJECT_CHUNK_BYTES,
  type AiProjectFile,
  type AiProjectRequest,
  type AiProjectResult,
} from '@smarteverything/domain';
import type { HarnessLocalFileSystem } from '@smarteverything/harness';
import { missing, type ProjectPaths } from './paths';
import type { ProjectAuthority } from './authority';
export async function projectStat(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  chat: string,
  path: string,
): Promise<AiProjectFile | null> {
  const absolute = await paths.resolve(chat, path, true);
  const info = await fs.stat(await fs.resolve(absolute));
  if (info === undefined) return null;
  if (info.type === 'other')
    throw new ApiError('forbidden', 'Project entries must be regular files or directories.');
  return { path, type: info.type, version: info.version, bytes: info.size ?? 0 };
}
export async function projectList(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  chat: string,
  options: { readonly path: string; readonly limit: number },
): Promise<{ readonly entries: AiProjectFile[]; readonly truncated: boolean }> {
  const { path, limit } = options;
  const directory = await opendir(await paths.resolve(chat, path));
  const entries: AiProjectFile[] = [];
  for await (const child of directory) {
    if (child.name === '.operations') continue;
    if (entries.length >= limit) return { entries, truncated: true };
    try {
      const entry = await projectStat(paths, fs, chat, `${path}/${child.name}`);
      if (entry !== null) entries.push(entry);
    } catch (cause) {
      if (!missing(cause)) throw cause;
    }
  }
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), truncated: false };
}
export async function projectRead(
  paths: ProjectPaths,
  authority: ProjectAuthority,
  request: Extract<AiProjectRequest, { operation: 'read' }>,
): Promise<AiProjectResult> {
  const read = await paths.bytes(authority.chatId, request.path, request.offset, {
    length: request.length + (request.encoding === 'utf8' ? 3 : 0),
    validate: (): void => {
      authority.validate(false);
    },
  });
  const end =
    request.encoding === 'utf8'
      ? textEnd(read.bytes, request.length, request.offset)
      : Math.min(read.bytes.length, request.length);
  const bytes = read.bytes.subarray(0, end);
  const next = request.offset + end;
  return {
    operation: 'read',
    path: request.path,
    file: { path: request.path, type: 'file', version: read.version, bytes: read.size },
    content:
      request.encoding === 'base64'
        ? bytes.toString('base64')
        : new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    encoding: request.encoding,
    offset: request.offset,
    next_offset: next < read.size ? next : null,
  };
}
function textEnd(bytes: Buffer, requested: number, offset: number): number {
  const first = bytes[0];
  if (offset > 0 && first !== undefined && (first & 0xc0) === 0x80)
    throw new ApiError(
      'invalid_request',
      'The UTF-8 read offset starts inside a character; use the returned next_offset.',
    );
  let end = Math.min(requested, bytes.length);
  while (end < bytes.length && (bytes[end] ?? 0) >> 6 === 2) end += 1;
  return end;
}
export async function projectSearch(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  authority: ProjectAuthority,
  request: Extract<AiProjectRequest, { operation: 'search' }>,
): Promise<AiProjectResult> {
  const pending = [request.path];
  const hits: NonNullable<AiProjectResult['hits']> = [];
  let visited = 0;
  let truncated = false;
  while (pending.length > 0 && hits.length < request.limit && visited < 1000) {
    authority.validate(false);
    const path = pending.shift();
    if (path === undefined) break;
    visited += 1;
    const file = await projectStat(paths, fs, authority.chatId, path);
    if (file === null) continue;
    if (file.type === 'directory') {
      const list = await projectList(paths, fs, authority.chatId, { path, limit: 1000 - visited });
      const remaining = Math.max(0, 1000 - visited - pending.length);
      truncated = truncated || list.truncated || list.entries.length > remaining;
      pending.push(...list.entries.slice(0, remaining).map((entry) => entry.path));
      continue;
    }
    const matches = await searchFile(paths, authority, file, {
      text: request.text,
      limit: request.limit - hits.length,
    });
    hits.push(...matches.hits);
    truncated = truncated || matches.truncated;
  }
  return {
    operation: 'search',
    path: request.path,
    hits,
    truncated: searchIncomplete(truncated, pending.length, hits.length, request.limit),
  };
}

async function searchFile(
  paths: ProjectPaths,
  authority: ProjectAuthority,
  file: AiProjectFile,
  options: { readonly text: string; readonly limit: number },
): Promise<{ readonly hits: NonNullable<AiProjectResult['hits']>; readonly truncated: boolean }> {
  if (file.bytes > AI_PROJECT_CHUNK_BYTES) return { hits: [], truncated: true };
  const bytes = await paths.bytes(authority.chatId, file.path, 0, {
    length: AI_PROJECT_CHUNK_BYTES,
    validate: (): void => {
      authority.validate(false);
    },
  });
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes.bytes);
  if (text.includes('\0') || text.includes('\ufffd')) return { hits: [], truncated: false };
  const hits: NonNullable<AiProjectResult['hits']> = [];
  for (const [line, value] of text.split(/\r?\n/u).entries()) {
    if (hits.length >= options.limit) return { hits, truncated: true };
    if (value.includes(options.text))
      hits.push({ path: file.path, line: line + 1, text: value.slice(0, 1000) });
  }
  return { hits, truncated: false };
}

function searchIncomplete(
  truncated: boolean,
  pending: number,
  hits: number,
  limit: number,
): boolean {
  return truncated || pending > 0 || hits >= limit;
}
