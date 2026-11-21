import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { Store } from '../store/store';
import { rollbackExchangeState } from './exchange-files';
import { committedElsewhere } from './intent-owners';
import type { ContentPatch } from './patch-files';
import { locateInRoot, ORPHAN_DIRECTORY } from './paths';
import { MARKER_DIRECTORY } from './root-marker';
import { DriveWriteError } from './write-error';

export const TMP_DIRECTORY = `${MARKER_DIRECTORY}/tmp`;
export const TRASH_DIRECTORY = `${MARKER_DIRECTORY}/trash`;
export const VERSIONS_DIRECTORY = `${MARKER_DIRECTORY}/versions`;

const RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;

export function purgeDeadline(at: string): string {
  return new Date(Date.parse(at) + RETENTION_DAYS * DAY_MS).toISOString();
}

export interface DriveWriteRoot {
  readonly id: string;
  readonly path: string;
  readonly versions: boolean;
}

export interface FileStamp {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly size: number;
  readonly mtimeNs: bigint;
  readonly mode: number;
  readonly nlink: number;
  readonly directory: boolean;
  readonly symlink: boolean;
}

export interface StagedWrite {
  readonly bytes: number;
  readonly sha256: string;
}

export type StageFile = (path: string, source: AsyncIterable<Uint8Array>) => Promise<StagedWrite>;

export interface DriveFiles {
  readonly stamp: (path: string) => Promise<FileStamp | null>;
  readonly list: (path: string) => Promise<readonly string[]>;
  readonly read: (path: string) => AsyncIterable<Uint8Array>;
  readonly mkdir: (path: string) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly link: (from: string, to: string) => Promise<void>;
  readonly unlink: (path: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly stage: StageFile;
  readonly stageUnsynced: StageFile;
  readonly writeDurable: (path: string, temporary: string, text: string) => Promise<void>;
  readonly writeUnsynced: (path: string, temporary: string, text: string) => Promise<void>;
  readonly stageEmpty: (path: string) => Promise<void>;
  readonly syncDirectory: (path: string) => Promise<void>;
  readonly syncPaths: (paths: readonly string[]) => Promise<void>;
  readonly chmod: (path: string, mode: number) => Promise<void>;
  readonly clone: (from: string, to: string, temporary: string) => Promise<void>;
  readonly writeUndo: (
    live: string,
    undo: string,
    temporary: string,
    patch: ContentPatch,
  ) => Promise<void>;
  readonly applyPatch: (live: string, staged: string, patch: ContentPatch) => Promise<void>;
  readonly restoreUndo: (live: string, undo: string) => Promise<void>;
}

export function locate(root: DriveWriteRoot, relPath: string): Promise<string> {
  return locateInRoot(root.path, relPath);
}

export function tmpRelPath(): string {
  return `${TMP_DIRECTORY}/${randomUUID()}`;
}

export function mountStagingRelPath(commitId: number): string {
  return `${TMP_DIRECTORY}/commit-${String(commitId)}`;
}

export function undoRelPath(stagedRelPath: string): string {
  return `${stagedRelPath}.undo`;
}

export function exchangeRelPath(intentId: string): string {
  return `${TMP_DIRECTORY}/${intentId}.exchange`;
}

export function orphanRelPath(inodeId: number): string {
  return `${ORPHAN_DIRECTORY}/${String(inodeId)}`;
}

export const DISK_FILE_BITS = 0o600;

export const DISK_FOLDER_BITS = 0o700;

export function diskModeOf(mode: number, folder: boolean): number {
  return mode | (folder ? DISK_FOLDER_BITS : DISK_FILE_BITS);
}

const SHA256 = /^[0-9a-f]{64}$/;

export function versionRelPath(sha256: string): string {
  if (!SHA256.test(sha256)) {
    throw new DriveWriteError('corrupt', 'A version is named by a lower-case SHA-256.');
  }
  return `${VERSIONS_DIRECTORY}/${sha256.slice(0, 2)}/${sha256}`;
}

export function shaOfVersionPath(relPath: string): string {
  const name = basename(relPath);
  if (!SHA256.test(name) || relPath !== versionRelPath(name)) {
    throw new DriveWriteError('corrupt', 'The path is not a stored version.');
  }
  return name;
}

export type MoveMode = 'replace' | 'keep';

async function moveKeeping(files: DriveFiles, from: string, to: string): Promise<void> {
  const stamp = await files.stamp(from);
  if (stamp?.directory === true) {
    if ((await files.stamp(to)) !== null) {
      throw new DriveWriteError('exists', 'The destination already exists.');
    }
    await files.rename(from, to);
    return;
  }
  await files.link(from, to);
  await files.unlink(from);
}

export interface Move {
  readonly from: string;
  readonly to: string;
  readonly mode: MoveMode;
}

export async function moveWithin(
  files: DriveFiles,
  root: DriveWriteRoot,
  move: Move,
  deferred?: Set<string>,
): Promise<void> {
  const from = await locate(root, move.from);
  const to = await locate(root, move.to);
  await files.mkdir(dirname(to));
  if (move.mode === 'keep') {
    await moveKeeping(files, from, to);
  } else {
    await files.rename(from, to);
  }
  const touched = dirname(from) === dirname(to) ? [dirname(to)] : [dirname(to), dirname(from)];
  for (const directory of touched) {
    if (deferred === undefined) await files.syncDirectory(directory);
    else deferred.add(directory);
  }
}

export type DriveFileStore = Pick<
  Store,
  | 'driveGrants'
  | 'driveInodes'
  | 'driveIntents'
  | 'driveMountCommits'
  | 'drivePlacements'
  | 'driveVersions'
  | 'driveTrash'
  | 'driveRoots'
  | 'driveShortcuts'
  | 'driveUploads'
  | 'host'
  | 'write'
>;

export interface FileEnv {
  readonly files: DriveFiles;
  readonly store: DriveFileStore;
  readonly log: Logger;
  readonly now: () => Date;
}

export interface RecoveryEnv extends FileEnv {
  readonly finishCommit: (intent: DriveIntent, root: DriveWriteRoot) => Promise<void>;
}

export interface RecoveryReport {
  readonly rolledBack: number;
  readonly completed: number;
  readonly tmpRemoved: number;
  readonly failed: number;
}

async function versionShared(
  env: FileEnv,
  root: DriveWriteRoot,
  versionPath: string,
): Promise<boolean> {
  const sha = shaOfVersionPath(versionPath);
  return (await env.store.host.call('driveVersions', 'references', root.id, sha)) > 0;
}

async function putBack(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
  paths: { readonly from: string; readonly to: string },
): Promise<void> {
  const shared = intent.op === 'version' && (await versionShared(env, root, intent.toPath));
  await (shared ? env.files.link(paths.to, paths.from) : env.files.rename(paths.to, paths.from));
  await env.files.syncDirectory(dirname(paths.from));
}

function sameFile(source: FileStamp, target: FileStamp): boolean {
  return source.ino === target.ino && source.dev === target.dev && !source.directory;
}

async function undoMove(env: FileEnv, root: DriveWriteRoot, intent: DriveIntent): Promise<void> {
  const from = await locate(root, intent.fromPath);
  const to = await locate(root, intent.toPath);
  const [source, target] = [await env.files.stamp(from), await env.files.stamp(to)];
  if (target === null) {
    return;
  }
  if (source === null) {
    await putBack(env, root, intent, { from, to });
  } else if (sameFile(source, target)) {
    await env.files.unlink(to);
  } else if (intent.op === 'trash' && !source.directory && !target.directory) {
    await env.files.remove(to);
  } else {
    env.log.warn('drive.intent_destination_kept', { rootId: root.id, op: intent.op });
  }
}

async function rollbackExchange(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<void> {
  await rollbackExchangeState(env.files, {
    a: await locate(root, intent.fromPath),
    b: await locate(root, intent.toPath),
    temporary: await locate(root, exchangeRelPath(intent.id)),
  });
}

async function rollbackPatch(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<boolean> {
  const staged = await locate(root, intent.fromPath);
  if ((await env.files.stamp(staged)) === null) {
    return false;
  }
  const live = await locate(root, intent.toPath);
  const undo = await locate(root, undoRelPath(intent.fromPath));
  if ((await env.files.stamp(undo)) !== null) {
    await env.files.restoreUndo(live, undo);
    await env.files.remove(undo);
  }
  await env.files.remove(staged);
  return true;
}

export function manifestPath(trashRel: string): string {
  return `${trashRel}.json`;
}

export async function writeManifest(
  files: DriveFiles,
  root: DriveWriteRoot,
  trashRel: string,
  entry: unknown,
): Promise<void> {
  const target = await locate(root, manifestPath(trashRel));
  await files.mkdir(dirname(target));
  await files.writeDurable(target, await locate(root, tmpRelPath()), JSON.stringify(entry));
}

async function restoreManifest(
  env: FileEnv,
  root: DriveWriteRoot,
  trashRel: string,
): Promise<void> {
  const entry = await env.store.host.call('driveTrash', 'find', basename(trashRel));
  const manifest = await locate(root, manifestPath(trashRel));
  if (entry !== undefined && (await env.files.stamp(manifest)) === null) {
    await writeManifest(env.files, root, trashRel, entry);
  }
}

async function rollbackTrash(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<void> {
  await undoMove(env, root, intent);
  await env.files.remove(await locate(root, manifestPath(intent.toPath)));
}

async function rollbackRestore(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<void> {
  await undoMove(env, root, intent);
  await restoreManifest(env, root, intent.fromPath);
}

async function rollbackCommit(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<void> {
  const tmp = await locate(root, intent.fromPath);
  const live = await locate(root, intent.toPath);
  if (intent.versionPath !== null && (await env.files.stamp(live)) === null) {
    const version = await locate(root, intent.versionPath);
    if ((await env.files.stamp(version)) !== null) {
      const shared = await versionShared(env, root, intent.versionPath);
      await (shared ? env.files.link(version, live) : env.files.rename(version, live));
      await env.files.syncDirectory(dirname(live));
    }
  }
  await env.files.remove(tmp);
}

export async function rollbackIntent(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<boolean> {
  if (await committedElsewhere(env.store, intent)) {
    env.log.warn('drive.intent_owned_elsewhere', { rootId: root.id, op: intent.op });
    return true;
  }
  if (intent.op === 'trash') {
    await rollbackTrash(env, root, intent);
  } else if (intent.op === 'restore') {
    await rollbackRestore(env, root, intent);
  } else if (intent.op === 'version') {
    await undoMove(env, root, intent);
  } else if (intent.op === 'exchange') {
    await rollbackExchange(env, root, intent);
  } else if (intent.op === 'patch') {
    return rollbackPatch(env, root, intent);
  } else if ((await env.files.stamp(await locate(root, intent.fromPath))) === null) {
    return false;
  } else {
    await rollbackCommit(env, root, intent);
  }
  return true;
}

export async function abandonIntent(
  env: FileEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<void> {
  try {
    if (await rollbackIntent(env, root, intent)) {
      await env.store.host.call('driveIntents', 'clear', intent.id);
    } else {
      env.log.warn('drive.intent_left_open', { rootId: root.id, op: intent.op });
    }
  } catch (cause) {
    env.log.error('drive.intent_abandon_failed', cause, { rootId: root.id, op: intent.op });
  }
}

async function resolveIntent(
  env: RecoveryEnv,
  root: DriveWriteRoot,
  intent: DriveIntent,
): Promise<'rolledBack' | 'completed'> {
  if (await rollbackIntent(env, root, intent)) {
    return 'rolledBack';
  }
  await env.finishCommit(intent, root);
  if ((await env.store.host.call('driveIntents', 'find', intent.id)) !== undefined) {
    throw new DriveWriteError('corrupt', 'Finishing the commit left its intent open.');
  }
  return 'completed';
}

async function removeOrphanTmp(env: FileEnv, root: DriveWriteRoot): Promise<number> {
  const directory = await locate(root, TMP_DIRECTORY);
  const held = new Set(await env.store.host.call('driveUploads', 'openIdsInRoot', root.id));
  for (const placement of await env.store.host.call('drivePlacements', 'forRoot', root.id)) {
    for (const commit of await env.store.host.call('driveMountCommits', 'open', placement.id)) {
      held.add(basename(mountStagingRelPath(commit.id)));
    }
  }
  const names = (await env.files.list(directory)).filter((name) => !held.has(name));
  for (const name of names) {
    await env.files.remove(join(directory, name));
  }
  return names.length;
}

export async function recoverIntents(
  env: RecoveryEnv,
  roots: readonly DriveWriteRoot[],
): Promise<RecoveryReport> {
  const tally = { rolledBack: 0, completed: 0, tmpRemoved: 0, failed: 0 };
  const byId = new Map(roots.map((root) => [root.id, root]));
  for (const intent of await env.store.host.call('driveIntents', 'all')) {
    const root = byId.get(intent.rootId);
    if (root === undefined) {
      continue;
    }
    try {
      const result = await resolveIntent(env, root, intent);
      if (result === 'rolledBack') {
        await env.store.host.call('driveIntents', 'clear', intent.id);
      }
      tally[result] += 1;
    } catch (cause) {
      tally.failed += 1;
      env.log.error('drive.intent_recovery_failed', cause, {
        rootId: root.id,
        op: intent.op,
        reason: messageOf(cause),
      });
    }
  }
  for (const root of roots) {
    if ((await env.store.host.call('driveIntents', 'forRoot', root.id)).length === 0) {
      tally.tmpRemoved += await removeOrphanTmp(env, root);
    }
  }
  return tally;
}
