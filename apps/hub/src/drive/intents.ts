import { randomUUID } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { Store } from '../store/store';
import { normalizeRelativePath, resolveInRoot } from './paths';
import { MARKER_DIRECTORY } from './root-marker';

export const TMP_DIRECTORY = `${MARKER_DIRECTORY}/tmp`;
export const TRASH_DIRECTORY = `${MARKER_DIRECTORY}/trash`;
export const VERSIONS_DIRECTORY = `${MARKER_DIRECTORY}/versions`;

const RETENTION_DAYS = 365;
const DAY_MS = 86_400_000;

export function purgeDeadline(at: string): string {
  return new Date(Date.parse(at) + RETENTION_DAYS * DAY_MS).toISOString();
}

export type DriveWriteFailure = 'exists' | 'missing' | 'corrupt';

export class DriveWriteError extends Error {
  override readonly name = 'DriveWriteError';

  constructor(
    readonly failure: DriveWriteFailure,
    message: string,
  ) {
    super(message);
  }
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
  readonly directory: boolean;
}

export interface StagedWrite {
  readonly bytes: number;
  readonly sha256: string;
}

export interface DriveFiles {
  readonly stamp: (path: string) => Promise<FileStamp | null>;
  readonly list: (path: string) => Promise<readonly string[]>;
  readonly read: (path: string) => AsyncIterable<Uint8Array>;
  readonly mkdir: (path: string) => Promise<void>;
  readonly rename: (from: string, to: string) => Promise<void>;
  readonly link: (from: string, to: string) => Promise<void>;
  readonly unlink: (path: string) => Promise<void>;
  readonly remove: (path: string) => Promise<void>;
  readonly stage: (path: string, source: AsyncIterable<Uint8Array>) => Promise<StagedWrite>;
  readonly writeDurable: (path: string, temporary: string, text: string) => Promise<void>;
  readonly syncDirectory: (path: string) => Promise<void>;
}

export async function locate(root: DriveWriteRoot, relPath: string): Promise<string> {
  const normalized = normalizeRelativePath(relPath);
  const parent = await resolveInRoot(
    root.path,
    dirname(normalized) === '.' ? '' : dirname(normalized),
  );
  return join(parent.absolute, basename(normalized));
}

export function tmpRelPath(): string {
  return `${TMP_DIRECTORY}/${randomUUID()}`;
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
): Promise<void> {
  const from = await locate(root, move.from);
  const to = await locate(root, move.to);
  await files.mkdir(dirname(to));
  if (move.mode === 'keep') {
    await moveKeeping(files, from, to);
  } else {
    await files.rename(from, to);
  }
  await files.syncDirectory(dirname(to));
  if (dirname(from) !== dirname(to)) {
    await files.syncDirectory(dirname(from));
  }
}

export type DriveFileStore = Pick<
  Store,
  | 'driveGrants'
  | 'driveIntents'
  | 'driveVersions'
  | 'driveTrash'
  | 'driveRoots'
  | 'driveUploads'
  | 'write'
>;

export interface FileEnv {
  readonly files: DriveFiles;
  readonly store: DriveFileStore;
  readonly log: Logger;
  readonly now: () => Date;
}

export interface RecoveryEnv extends FileEnv {
  readonly finishCommit: (intent: DriveIntent, root: DriveWriteRoot) => void;
}

export interface RecoveryReport {
  readonly rolledBack: number;
  readonly completed: number;
  readonly tmpRemoved: number;
  readonly failed: number;
}

async function undoMove(env: FileEnv, root: DriveWriteRoot, intent: DriveIntent): Promise<void> {
  const from = await locate(root, intent.fromPath);
  const to = await locate(root, intent.toPath);
  const [source, target] = [await env.files.stamp(from), await env.files.stamp(to)];
  if (target === null) {
    return;
  }
  if (source === null) {
    const shared =
      intent.op === 'version' &&
      env.store.driveVersions.references(root.id, shaOfVersionPath(intent.toPath)) > 0;
    await (shared ? env.files.link(to, from) : env.files.rename(to, from));
    await env.files.syncDirectory(dirname(from));
    return;
  }
  if (source.ino === target.ino && source.dev === target.dev && !source.directory) {
    await env.files.unlink(to);
    return;
  }
  env.log.warn('drive.intent_destination_kept', { rootId: root.id, op: intent.op });
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
  const entry = env.store.driveTrash.find(basename(trashRel));
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
      const shared =
        env.store.driveVersions.references(root.id, shaOfVersionPath(intent.versionPath)) > 0;
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
  if (intent.op === 'trash') {
    await rollbackTrash(env, root, intent);
  } else if (intent.op === 'restore') {
    await rollbackRestore(env, root, intent);
  } else if (intent.op === 'version') {
    await undoMove(env, root, intent);
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
      env.store.driveIntents.clear(intent.id);
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
  env.finishCommit(intent, root);
  if (env.store.driveIntents.find(intent.id) !== undefined) {
    throw new DriveWriteError('corrupt', 'Finishing the commit left its intent open.');
  }
  return 'completed';
}

async function removeOrphanTmp(env: FileEnv, root: DriveWriteRoot): Promise<number> {
  const directory = await locate(root, TMP_DIRECTORY);
  const openUploads = new Set(env.store.driveUploads.openIdsInRoot(root.id));
  const names = (await env.files.list(directory)).filter((name) => !openUploads.has(name));
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
  for (const intent of env.store.driveIntents.all()) {
    const root = byId.get(intent.rootId);
    if (root === undefined) {
      continue;
    }
    try {
      const result = await resolveIntent(env, root, intent);
      if (result === 'rolledBack') {
        env.store.driveIntents.clear(intent.id);
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
    if (env.store.driveIntents.forRoot(root.id).length === 0) {
      tally.tmpRemoved += await removeOrphanTmp(env, root);
    }
  }
  return tally;
}
