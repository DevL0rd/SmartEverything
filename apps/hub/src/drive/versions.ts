import { stageEmptyFile, syncDirectory, syncPaths, writeUnsynced } from './unsynced';
import {
  chmodNoFollow,
  cloneFile,
  readNoFollow,
  stageFile,
  stageFileUnsynced,
  writeDurable,
} from './file-ops';
import { randomUUID } from 'node:crypto';
import { link, lstat, mkdir, readdir, rename, rm, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import { isMissing } from '../fs-util';
import { DRIVE_VERSION, type DriveVia, type DriveVersion } from '@smarteverything/domain';
import type { DriveVersionEntry, DriveVersionFile } from '../store/repositories/drive-versions';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { FileItem } from './file-item';
import { applyPatch, restoreUndoLog, writeUndoLog } from './patch-files';
import { openIntent } from './intent-batch';
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
} from './intents';

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
  stageUnsynced: stageFileUnsynced,
  stageEmpty: stageEmptyFile,
  writeDurable,
  writeUnsynced,
  syncDirectory,
  syncPaths,
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
  durable = true,
): Promise<StagedBytes> {
  const relPath = tmpRelPath();
  const path = await locate(root, relPath);
  await env.files.mkdir(await locate(root, TMP_DIRECTORY));
  try {
    const written = durable
      ? await env.files.stage(path, source)
      : await env.files.stageUnsynced(path, source);
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
  readonly deferred?: Set<string> | undefined;
}

function sharesInode(existing: FileStamp | null): existing is FileStamp {
  return existing !== null && !existing.directory && !existing.symlink && existing.nlink > 1;
}

async function moveIntoPlace(
  env: FileEnv,
  request: CommitRequest,
  versionPath: string | null,
): Promise<void> {
  const { root, staged, relPath, deferred } = request;
  if (versionPath !== null) {
    await moveWithin(
      env.files,
      root,
      { from: relPath, to: versionPath, mode: 'replace' },
      deferred,
    );
  }
  await moveWithin(
    env.files,
    root,
    { from: staged.relPath, to: relPath, mode: 'replace' },
    deferred,
  );
  deferred?.add(await locate(root, relPath));
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
  const intent = await openIntent(env.store, {
    rootId: root.id,
    op: 'commit',
    fromPath: staged.relPath,
    toPath: relPath,
    versionPath,
  });
  try {
    await moveIntoPlace(env, request, versionPath);
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
