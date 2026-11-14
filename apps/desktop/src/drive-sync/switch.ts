import path from 'node:path';
import type { SyncEnginePort, SyncTarget, SyncWaiting } from './service.js';

export interface SwitchMounts {
  readonly flushJournal: (placementId: string) => Promise<void>;
  readonly unmount: (placementId: string) => Promise<void>;
}

export interface SwitchFs {
  readonly exists: (location: string) => Promise<boolean>;
  readonly rename: (from: string, to: string) => Promise<void>;
}

export interface SwitchPorts {
  readonly engine: SyncEnginePort;
  readonly mounts: SwitchMounts;
  readonly fs: SwitchFs;
  readonly platform: NodeJS.Platform;
}

export interface LeaveSynced {
  readonly placementId: string;
  readonly from: string;
  readonly to: string;
}

export type LeaveSyncedResult =
  | { readonly kind: 'switched'; readonly localCopy: string | null }
  | { readonly kind: 'refused'; readonly waiting: SyncWaiting };

export interface JoinSynced extends SyncTarget {
  readonly mountId: string;
}

function pathApi(platform: NodeJS.Platform): typeof path.posix {
  return platform === 'win32' ? path.win32 : path.posix;
}

function samePath(platform: NodeJS.Platform, first: string, second: string): boolean {
  const api = pathApi(platform);
  const left = api.resolve(first);
  const right = api.resolve(second);
  return platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function freeCopyPath(ports: SwitchPorts, location: string): Promise<string> {
  const api = pathApi(ports.platform);
  const { dir, base } = api.parse(api.resolve(location));
  let attempt = 1;
  for (;;) {
    const suffix = attempt === 1 ? '(local copy)' : `(local copy ${String(attempt)})`;
    const candidate = api.join(dir, `${base} ${suffix}`);
    if (!(await ports.fs.exists(candidate))) return candidate;
    attempt += 1;
  }
}

function isWaiting(waiting: SyncWaiting): boolean {
  return waiting.needBytes > 0 || waiting.pendingOps > 0;
}

export async function leaveSynced(
  ports: SwitchPorts,
  request: LeaveSynced,
): Promise<LeaveSyncedResult> {
  const waiting = await ports.engine.waiting(request.placementId);
  if (isWaiting(waiting)) return { kind: 'refused', waiting };
  await ports.engine.stop(request.placementId);
  if (!samePath(ports.platform, request.from, request.to)) {
    return { kind: 'switched', localCopy: null };
  }
  const localCopy = await freeCopyPath(ports, request.from);
  await ports.fs.rename(request.from, localCopy);
  return { kind: 'switched', localCopy };
}

export async function joinSynced(ports: SwitchPorts, request: JoinSynced): Promise<void> {
  await ports.mounts.flushJournal(request.mountId);
  await ports.mounts.unmount(request.mountId);
  await ports.engine.start({
    placementId: request.placementId,
    driveId: request.driveId,
    localPath: request.localPath,
    excluded: request.excluded,
    ignorePatterns: request.ignorePatterns,
    receiveOnly: request.receiveOnly,
  });
}
