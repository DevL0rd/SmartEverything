import { open, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ApiError,
  AI_PROJECT_CHUNK_BYTES,
  type AiProjectFile,
  type AiProjectRequest,
  type AiProjectResult,
} from '@smarteverything/domain';
import type { HarnessLocalFileSystem } from '@smarteverything/harness';

export interface ProjectBytes {
  readonly bytes: Buffer;
  readonly size: number;
  readonly version: string;
}
interface Folder {
  readonly root: string;
  readonly fs: HarnessLocalFileSystem;
}
const SEARCH_VISIT_MAX = 1000;

export async function projectStat(
  folder: Folder,
  path: string,
  absolute: string,
): Promise<AiProjectFile | null> {
  const info = await folder.fs.stat(await folder.fs.resolve(absolute));
  if (info === undefined) return null;
  if (info.type === 'other')
    throw new ApiError('forbidden', 'Project entries must be regular files or directories.');
  return { path, type: info.type, version: info.version, bytes: info.size ?? 0 };
}

export async function projectList(
  folder: Folder,
  options: { readonly path: string; readonly limit: number },
): Promise<{ readonly entries: AiProjectFile[]; readonly truncated: boolean }> {
  const names = (await readdir(join(folder.root, options.path))).sort();
  const entries: AiProjectFile[] = [];
  for (const name of names) {
    if (entries.length >= options.limit) return { entries, truncated: true };
    const path = `${options.path}/${name}`;
    const entry = await projectStat(folder, path, join(folder.root, path));
    if (entry !== null) entries.push(entry);
  }
  return { entries, truncated: false };
}

export async function readProjectBytes(
  folder: Folder,
  path: string,
  range: { readonly offset: number; readonly length: number },
): Promise<ProjectBytes> {
  const absolute = join(folder.root, path);
  const handle = await open(absolute, 'r');
  try {
    const buffer = Buffer.alloc(range.length);
    const read = await handle.read(buffer, 0, range.length, range.offset);
    const file = await projectStat(folder, path, absolute);
    if (file?.type !== 'file')
      throw new ApiError('invalid_request', 'Only regular project files can be read.');
    return { bytes: buffer.subarray(0, read.bytesRead), size: file.bytes, version: file.version };
  } finally {
    await handle.close();
  }
}

export async function projectRead(
  folder: Folder,
  request: Extract<AiProjectRequest, { operation: 'read' }>,
): Promise<AiProjectResult> {
  const read = await readProjectBytes(folder, request.path, {
    offset: request.offset,
    length: request.length + (request.encoding === 'utf8' ? 3 : 0),
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
  folder: Folder,
  request: Extract<AiProjectRequest, { operation: 'search' }>,
): Promise<AiProjectResult> {
  const pending = [request.path];
  const hits: NonNullable<AiProjectResult['hits']> = [];
  let truncated = false;
  for (let visited = 0; visited < SEARCH_VISIT_MAX && hits.length < request.limit; visited += 1) {
    const path = pending.shift();
    if (path === undefined) break;
    const visit = await searchPath(folder, path, {
      text: request.text,
      limit: request.limit - hits.length,
      budget: SEARCH_VISIT_MAX - visited,
    });
    pending.push(...visit.children);
    hits.push(...visit.hits);
    truncated = truncated || visit.truncated;
  }
  return {
    operation: 'search',
    path: request.path,
    hits,
    truncated: truncated || pending.length > 0 || hits.length >= request.limit,
  };
}

interface Visit {
  readonly children: readonly string[];
  readonly hits: NonNullable<AiProjectResult['hits']>;
  readonly truncated: boolean;
}
async function searchPath(
  folder: Folder,
  path: string,
  options: { readonly text: string; readonly limit: number; readonly budget: number },
): Promise<Visit> {
  const file = await projectStat(folder, path, join(folder.root, path));
  if (file === null) return { children: [], hits: [], truncated: false };
  if (file.type === 'file') {
    const found = await searchFile(folder, file, options.text, options.limit);
    return { children: [], ...found };
  }
  const list = await projectList(folder, { path, limit: options.budget });
  return { children: list.entries.map((entry) => entry.path), hits: [], truncated: list.truncated };
}

async function searchFile(
  folder: Folder,
  file: AiProjectFile,
  needle: string,
  limit: number,
): Promise<{ readonly hits: NonNullable<AiProjectResult['hits']>; readonly truncated: boolean }> {
  if (file.bytes > AI_PROJECT_CHUNK_BYTES) return { hits: [], truncated: true };
  const read = await readProjectBytes(folder, file.path, {
    offset: 0,
    length: AI_PROJECT_CHUNK_BYTES,
  });
  const text = new TextDecoder('utf-8', { fatal: false }).decode(read.bytes);
  if (text.includes('\0') || text.includes('�')) return { hits: [], truncated: false };
  const hits: NonNullable<AiProjectResult['hits']> = [];
  for (const [line, value] of text.split(/\r?\n/u).entries()) {
    if (hits.length >= limit) return { hits, truncated: true };
    if (value.includes(needle))
      hits.push({ path: file.path, line: line + 1, text: value.slice(0, 1000) });
  }
  return { hits, truncated: false };
}
