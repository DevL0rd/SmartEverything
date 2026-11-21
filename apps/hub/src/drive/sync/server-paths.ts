import type { DriveItem } from '@smarteverything/domain';
import { checkSyncPath, collidesWith } from '@smarteverything/domain/drive-sync';
import { DRIVE_PAGE_SIZE } from '../page-size';
import type { SyncScope } from './placement-scope';
import { inScope, toDrivePath } from './sync-paths';
import type { ConflictReason, SyncEnv } from './server-ops';

const PORTABLE_OS = /windows|mac|darwin/iu;

function portableRoot(env: SyncEnv, rootId: string): boolean {
  return env.store.drivePlacements
    .forRoot(rootId)
    .filter((placement) => placement.mode === 'synced' && placement.enabled)
    .some((placement) => {
      const os = env.store.devices.find(placement.deviceId)?.details['os'];
      return typeof os === 'string' && PORTABLE_OS.test(os);
    });
}

function* namesIn(env: SyncEnv, rootId: string, parent: DriveItem | null): Generator<string> {
  let after: string | null = null;
  do {
    const window = env.store.driveItems.children({
      rootId,
      parentId: parent?.id ?? null,
      after,
      limit: DRIVE_PAGE_SIZE,
      viewer: null,
    });
    for (const { item } of window.entries) yield item.name;
    after = window.next;
  } while (after !== null);
}

function ancestryReason(
  env: SyncEnv,
  rootId: string,
  relPath: string,
  portable: boolean,
): ConflictReason | null {
  const segments = relPath.split('/');
  let parent: DriveItem | null = null;
  let prefix = '';
  for (const [at, segment] of segments.entries()) {
    if (portable && collidesWith(segment, namesIn(env, rootId, parent)) !== null) return 'path';
    prefix = prefix === '' ? segment : `${prefix}/${segment}`;
    const next = env.store.driveItems.byPath(rootId, prefix, null);
    if (next === undefined) return null;
    if (at < segments.length - 1 && next.kind !== 'folder') return 'exists';
    parent = next;
  }
  return null;
}

export function pathReason(
  env: SyncEnv,
  scope: SyncScope,
  wirePath: string,
): ConflictReason | null {
  const rootId = scope.drive.id;
  const portable = portableRoot(env, rootId);
  const drivePath = toDrivePath(scope, wirePath);
  if (!inScope(scope, drivePath) || !checkSyncPath(wirePath, { portable }).ok) return 'path';
  return ancestryReason(env, rootId, drivePath, portable);
}
