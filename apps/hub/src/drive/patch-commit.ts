import { createHash } from 'node:crypto';
import type { DriveIntent } from '../store/repositories/drive-intents';
import {
  abandonIntent,
  locate,
  tmpRelPath,
  undoRelPath,
  versionRelPath,
  type DriveWriteRoot,
  type FileEnv,
  type FileStamp,
} from './intents';
import { DriveWriteError } from './write-error';
import { openIntent } from './intent-batch';
import type { ContentPatch } from './patch-files';

export interface PatchRequest {
  readonly root: DriveWriteRoot;
  readonly staged: { readonly relPath: string };
  readonly relPath: string;
  readonly previousSha256: string | null;
  readonly patch: ContentPatch;
}

export interface CommittedBytes {
  readonly intent: DriveIntent;
  readonly captured: { readonly sha256: string; readonly relPath: string } | null;
  readonly sha256: string | null;
  readonly bytes: number;
  readonly stamp: FileStamp;
}

export async function hashOf(env: FileEnv, path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of env.files.read(path)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

export interface CaptureSource {
  readonly root: DriveWriteRoot;
  readonly live: string;
  readonly existing: FileStamp | null;
  readonly previousSha256: string | null;
}

export async function versionToCapture(
  env: FileEnv,
  source: CaptureSource,
): Promise<string | null> {
  const { root, live, existing } = source;
  if (existing?.directory === true) {
    throw new DriveWriteError('exists', 'A folder is in the way of the file.');
  }
  if (existing === null || existing.symlink || !root.versions) {
    return null;
  }
  return source.previousSha256 ?? (await hashOf(env, live));
}

export async function stampAfter(
  env: FileEnv,
  root: DriveWriteRoot,
  relPath: string,
): Promise<FileStamp> {
  const stamp = await env.files.stamp(await locate(root, relPath));
  if (stamp === null) {
    throw new DriveWriteError('missing', 'The committed file is missing after the commit.');
  }
  return stamp;
}

async function applyPatch(
  env: FileEnv,
  request: PatchRequest,
  live: string,
  versionPath: string | null,
): Promise<void> {
  const { root, staged, patch } = request;
  if (versionPath !== null) {
    const version = await locate(root, versionPath);
    if ((await env.files.stamp(version)) === null) {
      await env.files.clone(live, version, await locate(root, tmpRelPath()));
    }
  }
  const stagedPath = await locate(root, staged.relPath);
  await env.files.writeUndo(
    live,
    await locate(root, undoRelPath(staged.relPath)),
    await locate(root, tmpRelPath()),
    patch,
  );
  await env.files.applyPatch(live, stagedPath, patch);
  await env.files.remove(stagedPath);
}

export async function commitPatch(env: FileEnv, request: PatchRequest): Promise<CommittedBytes> {
  const { root, staged, relPath } = request;
  const live = await locate(root, relPath);
  const existing = await env.files.stamp(live);
  if (existing === null || existing.directory || existing.symlink) {
    throw new DriveWriteError('missing', 'The file to patch is not a file on disk.');
  }
  const captured = await versionToCapture(env, {
    root,
    live,
    existing,
    previousSha256: request.previousSha256,
  });
  const versionPath = captured === null ? null : versionRelPath(captured);
  const intent = await openIntent(env.store, {
    rootId: root.id,
    op: 'patch',
    fromPath: staged.relPath,
    toPath: relPath,
    versionPath,
  });
  try {
    await applyPatch(env, request, live, versionPath);
  } catch (cause) {
    await abandonIntent(env, root, intent);
    throw cause;
  }
  const stamp = await stampAfter(env, root, relPath);
  return {
    intent,
    captured:
      captured === null || versionPath === null ? null : { sha256: captured, relPath: versionPath },
    sha256: null,
    bytes: stamp.size,
    stamp,
  };
}

export async function discardUndo(
  env: FileEnv,
  root: DriveWriteRoot,
  stagedRelPath: string,
): Promise<void> {
  await env.files.remove(await locate(root, undoRelPath(stagedRelPath)));
}
