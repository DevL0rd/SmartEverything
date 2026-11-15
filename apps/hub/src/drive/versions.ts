import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import { isMissing } from '../fs-util';
import { DRIVE_VERSION, type DriveVia, type DriveVersion } from '@smarteverything/domain';
import type { DriveVersionEntry, DriveVersionFile } from '../store/repositories/drive-versions';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { FileItem } from './file-item';
import { applyPatch, restoreUndoLog, writeUndoLog } from './patch-files';
import {
  commitPatch,
  hashOf,
  stampAfter,
  versionToCapture,
  type CommittedBytes,
} from './patch-commit';
import {
  abandonIntent,
  diskModeOf,
  DriveWriteError,
  locate,
  moveWithin,
  purgeDeadline,
  shaOfVersionPath,
  TMP_DIRECTORY,
  tmpRelPath,
  VERSIONS_DIRECTORY,
  versionRelPath,
  type DriveWriteRoot,
  type FileEnv,
  type DriveFiles,
  type DriveFileStore,
  type FileStamp,
  type StagedWrite,
} from './intents';

async function stageFile(path: string, source: AsyncIterable<Uint8Array>): Promise<StagedWrite> {
  const hash = createHash('sha256');
  const handle = await open(path, 'wx', 0o600);
  let bytes = 0;
  try {
    for await (const chunk of source) {
      await handle.write(chunk);
      hash.update(chunk);
      bytes += chunk.byteLength;
    }
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function* readNoFollow(path: string): AsyncGenerator<Uint8Array> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    yield* handle.createReadStream({ autoClose: false });
  } finally {
    await handle.close();
  }
}

async function chmodNoFollow(path: string, mode: number): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    await handle.chmod(mode);
  } finally {
    await handle.close();
  }
}

async function cloneFile(from: string, to: string, temporary: string): Promise<void> {
  await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
  await mkdir(dirname(to), { recursive: true, mode: 0o700 });
  const source = await open(from, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    await copyFile(
      `/proc/self/fd/${String(source.fd)}`,
      temporary,
      constants.COPYFILE_FICLONE | constants.COPYFILE_EXCL,
    );
    const copied = await open(temporary, 'r');
    try {
      await copied.sync();
    } finally {
      await copied.close();
    }
    await rename(temporary, to);
    await syncDirectory(dirname(to));
  } catch (cause) {
    await rm(temporary, { force: true });
    throw cause;
  } finally {
    await source.close();
  }
}

async function writeDurable(path: string, temporary: string, text: string): Promise<void> {
  await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
  await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
  const handle = await open(temporary, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
  await syncDirectory(dirname(path));
}

export const nodeFiles: DriveFiles = {
  stamp: async (path) => {
    try {
      const stat = await lstat(path, { bigint: true });
      return {
        dev: stat.dev,
        ino: stat.ino,
        size: Number(stat.size),
        mtimeNs: stat.mtimeNs,
        mode: Number(stat.mode & 0o7777n),
        nlink: Number(stat.nlink),
        directory: stat.isDirectory(),
        symlink: stat.isSymbolicLink(),
      };
    } catch (cause) {
      if (isMissing(cause)) {
        return null;
      }
      throw cause;
    }
  },
  list: async (path) => {
    try {
      return await readdir(path);
    } catch (cause) {
      if (isMissing(cause)) {
        return [];
      }
      throw cause;
    }
  },
  read: readNoFollow,
  mkdir: async (path) => {
    await mkdir(path, { recursive: true, mode: 0o700 });
  },
  rename,
  link: async (from, to) => {
    try {
      await link(from, to);
    } catch (cause) {
      if (fsCode(cause) === 'EEXIST') {
        throw new DriveWriteError('exists', 'The destination already exists.');
      }
      throw cause;
    }
  },
  unlink,
  remove: (path) => rm(path, { recursive: true, force: true }),
  stage: stageFile,
  writeDurable,
  syncDirectory,
  chmod: chmodNoFollow,
  clone: cloneFile,
  writeUndo: writeUndoLog,
  applyPatch,
  restoreUndo: restoreUndoLog,
};

export function fileEnv(
  store: DriveFileStore,
  log: Logger,
  now: () => Date = () => new Date(),
  files: DriveFiles = nodeFiles,
): FileEnv {
  return { files, store, log, now };
}

const SHA256 = /^[0-9a-f]{64}$/;

const FILE_DEFAULT_MODE = 0o644;

export interface StagedBytes {
  readonly relPath: string;
  readonly bytes: number;
  readonly sha256: string;
}

export async function stageBytes(
  env: FileEnv,
  root: DriveWriteRoot,
  source: AsyncIterable<Uint8Array>,
): Promise<StagedBytes> {
  const relPath = tmpRelPath();
  const path = await locate(root, relPath);
  await env.files.mkdir(await locate(root, TMP_DIRECTORY));
  try {
    const written = await env.files.stage(path, source);
    return { relPath, ...written };
  } catch (cause) {
    await env.files.remove(path);
    throw cause;
  }
}

export async function stageInPlace(
  env: FileEnv,
  root: DriveWriteRoot,
  relPath: string,
  sha256?: string,
): Promise<StagedBytes> {
  const path = await locate(root, relPath);
  const stamp = await env.files.stamp(path);
  if (stamp === null || stamp.directory) {
    throw new DriveWriteError('missing', 'The file to put in place is missing from disk.');
  }
  return { relPath, bytes: stamp.size, sha256: sha256 ?? (await hashOf(env, path)) };
}

export interface CommitRequest {
  readonly root: DriveWriteRoot;
  readonly staged: StagedBytes;
  readonly relPath: string;
  readonly previousSha256: string | null;
  readonly mode?: number | undefined;
}

function sharesInode(existing: FileStamp | null): existing is FileStamp {
  return existing !== null && !existing.directory && !existing.symlink && existing.nlink > 1;
}

async function replaceFile(
  env: FileEnv,
  request: CommitRequest,
  existing: FileStamp | null,
): Promise<CommittedBytes> {
  const { root, staged, relPath } = request;
  const captured = await versionToCapture(env, {
    root,
    live: await locate(root, relPath),
    existing,
    previousSha256: request.previousSha256,
  });
  const versionPath = captured === null ? null : versionRelPath(captured);
  await env.files.chmod(
    await locate(root, staged.relPath),
    diskModeOf(request.mode ?? existing?.mode ?? FILE_DEFAULT_MODE, false),
  );
  const intent = env.store.driveIntents.open({
    rootId: root.id,
    op: 'commit',
    fromPath: staged.relPath,
    toPath: relPath,
    versionPath,
  });
  try {
    if (versionPath !== null) {
      await moveWithin(env.files, root, { from: relPath, to: versionPath, mode: 'replace' });
    }
    await moveWithin(env.files, root, { from: staged.relPath, to: relPath, mode: 'replace' });
  } catch (cause) {
    await abandonIntent(env, root, intent);
    throw cause;
  }
  const stamp = await stampAfter(env, root, relPath);
  return {
    intent,
    captured:
      captured === null || versionPath === null ? null : { sha256: captured, relPath: versionPath },
    sha256: staged.sha256,
    bytes: staged.bytes,
    stamp,
  };
}

export async function commitBytes(env: FileEnv, request: CommitRequest): Promise<CommittedBytes> {
  const { root, staged, relPath } = request;
  const existing = await env.files.stamp(await locate(root, relPath));
  if (!sharesInode(existing)) {
    return replaceFile(env, request, existing);
  }
  const patched = await commitPatch(env, {
    root,
    staged,
    relPath,
    previousSha256: request.previousSha256,
    patch: { ranges: staged.bytes === 0 ? [] : [[0, staged.bytes]], size: staged.bytes },
  });
  return { ...patched, sha256: staged.sha256 };
}

export interface VersionSource {
  readonly itemId: string;
  readonly rev: number;
  readonly sha256: string;
  readonly bytes: number;
  readonly actorProfileId: string | null;
  readonly via: DriveVia;
  readonly deviceId: string | null;
  readonly addedByProfileId: string | null;
}

export function newVersion(env: FileEnv, source: VersionSource): DriveVersion {
  const at = env.now().toISOString();
  return DRIVE_VERSION.parse({ ...source, id: randomUUID(), at, purgeAt: purgeDeadline(at) });
}

export function recordOutsideVersion(
  env: FileEnv,
  rootId: string,
  found: { readonly item: FileItem; readonly versionPath: string },
): void {
  env.store.driveVersions.insert(
    rootId,
    newVersion(env, {
      itemId: found.item.id,
      rev: found.item.rev,
      sha256: shaOfVersionPath(found.versionPath),
      bytes: found.item.bytes,
      actorProfileId: null,
      via: 'outside',
      deviceId: null,
      addedByProfileId: found.item.addedByProfileId,
    }),
  );
}

export async function captureVersion(
  env: FileEnv,
  root: DriveWriteRoot,
  relPath: string,
  sha256: string,
): Promise<{ readonly intent: DriveIntent; readonly versionPath: string }> {
  const versionPath = versionRelPath(sha256);
  const intent = env.store.driveIntents.open({
    rootId: root.id,
    op: 'version',
    fromPath: relPath,
    toPath: versionPath,
    versionPath,
  });
  try {
    await moveWithin(env.files, root, { from: relPath, to: versionPath, mode: 'replace' });
  } catch (cause) {
    await abandonIntent(env, root, intent);
    throw cause;
  }
  return { intent, versionPath };
}

export async function stageVersion(
  env: FileEnv,
  root: DriveWriteRoot,
  version: DriveVersion,
): Promise<StagedBytes> {
  const source = await locate(root, versionRelPath(version.sha256));
  const staged = await stageBytes(env, root, env.files.read(source));
  if (staged.sha256 !== version.sha256) {
    await env.files.remove(await locate(root, staged.relPath));
    throw new DriveWriteError('corrupt', 'The stored version no longer matches its checksum.');
  }
  return staged;
}

export async function unlinkVersionFiles(
  env: FileEnv,
  files: readonly DriveVersionFile[],
): Promise<void> {
  for (const file of files) {
    const root = env.store.driveRoots.byId(file.rootId);
    await env.files.remove(await locate(root, versionRelPath(file.sha256)));
  }
}

export async function purgeVersions(
  env: FileEnv,
  ids: readonly string[],
): Promise<readonly DriveVersionEntry[]> {
  if (ids.length === 0) {
    return [];
  }
  const purged = env.store.write(() => env.store.driveVersions.purge(ids));
  await unlinkVersionFiles(env, purged.unlink);
  return purged.removed;
}

export async function sweepOrphanVersionsAtStart(
  env: FileEnv,
  root: DriveWriteRoot,
): Promise<number> {
  const base = await locate(root, VERSIONS_DIRECTORY);
  let removed = 0;
  for (const bucket of await env.files.list(base)) {
    for (const name of await env.files.list(join(base, bucket))) {
      if (SHA256.test(name) && env.store.driveVersions.references(root.id, name) === 0) {
        await env.files.remove(join(base, bucket, name));
        removed += 1;
      }
    }
  }
  return removed;
}
