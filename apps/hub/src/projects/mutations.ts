import { projectTextFile, type ProjectTextOutcome } from './text-files';
import { projectDiffBasis } from './diff-basis';
import { randomUUID } from 'node:crypto';
import { link, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import {
  ApiError,
  AI_PROJECT_BYTES_MAX,
  type AiProjectRequest,
  type AiProjectResult,
} from '@smarteverything/domain';
import type { HarnessLocalFileSystem } from '@smarteverything/harness';
import type { ProjectAuthority } from './authority';
import type { ProjectPaths } from './paths';
import { projectStat } from './reads';
export type ProjectFileMutation = Extract<
  AiProjectRequest,
  { operation: 'write' | 'edit' | 'mkdir' | 'move' | 'remove' }
>;
export type ProjectMutation = Exclude<
  AiProjectRequest,
  { operation: 'stat' | 'read' | 'list' | 'search' }
>;

export async function projectMutation(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  authority: ProjectAuthority,
  request: ProjectFileMutation,
): Promise<AiProjectResult> {
  if (request.path.split('/').length < 2)
    throw new ApiError('forbidden', 'The managed area roots cannot be removed or replaced.');
  if (request.operation === 'write' || request.operation === 'edit')
    return projectTextMutation(paths, fs, authority, request);
  const chat = authority.chatId;
  const absolute = await paths.resolve(chat, request.path, true);
  authority.validate(true);
  if (request.operation === 'mkdir') {
    await paths.parent(chat, request.path);
    authority.validate(true);
    await mkdir(absolute, { recursive: true, mode: 0o700 });
  } else {
    await requireVersion(paths, fs, chat, { path: request.path, version: request.version });
    if (request.operation === 'move') {
      if (request.destination.split('/').length < 2)
        throw new ApiError('forbidden', 'Managed area roots cannot be move destinations.');
      const target = await paths.parent(chat, request.destination);
      if ((await projectStat(paths, fs, chat, request.destination)) !== null)
        throw new ApiError('conflict', 'The move destination already exists.');
      authority.validate(true);
      await rename(absolute, target);
    } else {
      authority.validate(true);
      await rm(absolute, { recursive: request.recursive, force: request.version === null });
    }
  }
  return {
    operation: request.operation,
    path: request.path,
    file: await projectStat(
      paths,
      fs,
      chat,
      request.operation === 'move' ? request.destination : request.path,
    ),
  };
}
async function projectTextMutation(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  authority: ProjectAuthority,
  request: Extract<ProjectMutation, { operation: 'write' | 'edit' }>,
): Promise<AiProjectResult> {
  if (request.operation === 'write' && request.encoding === 'base64')
    return projectBinaryWrite(paths, fs, authority, request);
  if (request.operation === 'write' && Buffer.byteLength(request.content) > AI_PROJECT_BYTES_MAX)
    throw new ApiError('invalid_request', 'The project write exceeds 25 MiB.');
  if (request.operation === 'edit') {
    const file = await projectStat(paths, fs, authority.chatId, request.path);
    if (file === null || file.bytes > AI_PROJECT_BYTES_MAX)
      throw new ApiError('invalid_request', 'The edit requires a regular file of at most 25 MiB.');
  }
  const outcome = await projectTextFile(paths, fs, authority, request);
  return projectTextResult(
    request,
    outcome,
    await projectStat(paths, fs, authority.chatId, request.path),
  );
}
export async function requireVersion(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  chat: string,
  guard: { readonly path: string; readonly version: string | null },
): Promise<void> {
  const { path, version } = guard;
  const file = await projectStat(paths, fs, chat, path);
  if ((version === null && file !== null) || (version !== null && file?.version !== version))
    throw new ApiError(
      'conflict',
      'The managed file version changed; read its current version before editing.',
    );
}
async function projectBinaryWrite(
  paths: ProjectPaths,
  fs: HarnessLocalFileSystem,
  authority: ProjectAuthority,
  request: Extract<ProjectMutation, { operation: 'write' }>,
): Promise<AiProjectResult> {
  const bytes = Buffer.from(request.content, 'base64');
  if (bytes.length > AI_PROJECT_BYTES_MAX || bytes.toString('base64') !== request.content)
    throw new ApiError(
      'invalid_request',
      'The binary project write must be canonical base64 of at most 25 MiB.',
    );
  const absolute = await paths.parent(authority.chatId, request.path);
  await requireVersion(paths, fs, authority.chatId, {
    path: request.path,
    version: request.version,
  });
  const directory = join(dirname(absolute), `.project-${randomUUID()}`);
  await mkdir(directory, { mode: 0o700 });
  const temporary = join(directory, 'content');
  try {
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    authority.validate(true);
    await paths.resolve(authority.chatId, request.path, true);
    await requireVersion(paths, fs, authority.chatId, {
      path: request.path,
      version: request.version,
    });
    authority.validate(true);
    if (request.version === null) await link(temporary, absolute);
    else await rename(temporary, absolute);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return {
    operation: 'write',
    path: request.path,
    file: await projectStat(paths, fs, authority.chatId, request.path),
  };
}

export function projectTextResult(
  request: { readonly operation: 'write' | 'edit' | 'transfer_finish'; readonly path: string },
  outcome: ProjectTextOutcome,
  file: AiProjectResult['file'],
): AiProjectResult {
  const basis = projectDiffBasis(outcome.before, outcome.after, outcome.before_truncated);
  return {
    operation: request.operation,
    path: request.path,
    file,
    before: basis.before,
    after: basis.after,
    diff: { ...basis, language: extname(request.path).slice(1), version: outcome.version },
  };
}
