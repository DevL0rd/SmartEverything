import { randomUUID } from 'node:crypto';
import { link, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import {
  ApiError,
  AI_PROJECT_BYTES_MAX,
  type AiProjectFile,
  type AiProjectRequest,
  type AiProjectResult,
} from '@smarteverything/domain';
import { HarnessFsVersion, type HarnessLocalFileSystem } from '@smarteverything/harness';
import { projectDiffBasis } from './diff-basis';
import { projectStat } from './reads';

export type ProjectMutation = Exclude<
  AiProjectRequest,
  { operation: 'stat' | 'read' | 'list' | 'search' }
>;
type Write = Extract<ProjectMutation, { operation: 'write' }>;
type Edit = Extract<ProjectMutation, { operation: 'edit' }>;
interface Folder {
  readonly root: string;
  readonly fs: HarnessLocalFileSystem;
}
interface TextOutcome {
  readonly before: string | null;
  readonly after: string;
  readonly version: string;
  readonly updated: boolean;
}

export async function projectMutation(
  folder: Folder,
  request: ProjectMutation,
): Promise<AiProjectResult> {
  if (request.path.split('/').length < 2)
    throw new ApiError('forbidden', 'The managed area roots cannot be removed or replaced.');
  const absolute = join(folder.root, request.path);
  if (request.operation === 'write') return write(folder, request, absolute);
  if (request.operation === 'edit') return edit(folder, request, absolute);
  if (request.operation === 'mkdir') await mkdir(absolute, { recursive: true, mode: 0o700 });
  else if (request.operation === 'move') await move(folder, request, absolute);
  else {
    await requireVersion(folder, request.path, request.version);
    await rm(absolute, { recursive: request.recursive, force: request.version === null });
  }
  const path = request.operation === 'move' ? request.destination : request.path;
  return {
    operation: request.operation,
    path: request.path,
    file: await projectStat(folder, path, join(folder.root, path)),
  };
}

async function move(
  folder: Folder,
  request: Extract<ProjectMutation, { operation: 'move' }>,
  absolute: string,
): Promise<void> {
  if (request.destination.split('/').length < 2)
    throw new ApiError('forbidden', 'Managed area roots cannot be move destinations.');
  await requireVersion(folder, request.path, request.version);
  const target = join(folder.root, request.destination);
  if ((await projectStat(folder, request.destination, target)) !== null)
    throw new ApiError('conflict', 'The move destination already exists.');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await rename(absolute, target);
}

async function write(folder: Folder, request: Write, absolute: string): Promise<AiProjectResult> {
  const bytes = request.encoding === 'base64' ? Buffer.from(request.content, 'base64') : undefined;
  if (bytes !== undefined && bytes.toString('base64') !== request.content)
    throw new ApiError('invalid_request', 'The binary project write must be canonical base64.');
  if ((bytes?.length ?? Buffer.byteLength(request.content)) > AI_PROJECT_BYTES_MAX)
    throw new ApiError('invalid_request', 'The project write exceeds 25 MiB.');
  await requireWritable(folder, request.path, request.version);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  if (bytes !== undefined) {
    await writeBytes(absolute, bytes, request.version === null);
    return {
      operation: 'write',
      path: request.path,
      file: await projectStat(folder, request.path, absolute),
    };
  }
  const outcome = await folder.fs.writeText(
    await folder.fs.resolve(absolute),
    request.content,
    request.version === null
      ? { kind: 'createIfAbsent' }
      : { kind: 'replaceIfVersion', version: HarnessFsVersion(request.version) },
  );
  return textResult(folder, request, {
    before: outcome.before,
    after: outcome.after,
    version: outcome.version,
    updated: outcome.operation === 'update',
  });
}

async function edit(folder: Folder, request: Edit, absolute: string): Promise<AiProjectResult> {
  const file = await requireVersion(folder, request.path, request.version);
  if (file?.type !== 'file' || file.bytes > AI_PROJECT_BYTES_MAX)
    throw new ApiError('invalid_request', 'The edit requires a regular file of at most 25 MiB.');
  const outcome = await folder.fs.editText(
    await folder.fs.resolve(absolute),
    {
      oldString: request.old_string,
      newString: request.new_string,
      replaceAll: request.replace_all,
    },
    { version: HarnessFsVersion(request.version) },
  );
  return textResult(folder, request, { ...outcome, updated: true });
}

async function writeBytes(absolute: string, bytes: Buffer, create: boolean): Promise<void> {
  const temporary = join(dirname(absolute), `.${basename(absolute)}.${randomUUID()}.part`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    if (create) await link(temporary, absolute);
    else await rename(temporary, absolute);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function requireWritable(
  folder: Folder,
  path: string,
  version: string | null,
): Promise<void> {
  const file = await projectStat(folder, path, join(folder.root, path));
  if (version === null && file !== null)
    throw new ApiError('conflict', 'The managed file already exists; read it before replacing it.');
  if (version !== null && file?.version !== version)
    throw new ApiError('conflict', 'The managed file changed since it was read.');
}

async function requireVersion(
  folder: Folder,
  path: string,
  version: string | null,
): Promise<AiProjectFile | null> {
  const file = await projectStat(folder, path, join(folder.root, path));
  if ((version === null && file !== null) || (version !== null && file?.version !== version))
    throw new ApiError(
      'conflict',
      'The managed file version changed; read its current version before editing.',
    );
  return file;
}

async function textResult(
  folder: Folder,
  request: Write | Edit,
  outcome: TextOutcome,
): Promise<AiProjectResult> {
  const basis = projectDiffBasis(
    outcome.before,
    outcome.after,
    outcome.before === null && outcome.updated,
  );
  return {
    operation: request.operation,
    path: request.path,
    file: await projectStat(folder, request.path, join(folder.root, request.path)),
    before: basis.before,
    after: basis.after,
    diff: { ...basis, language: extname(request.path).slice(1), version: outcome.version },
  };
}
