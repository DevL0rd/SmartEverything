import type { DriveRoot, ProfileRow } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { HubLayout } from '../data-layout';
import type { Store } from '../store/store';
import { UNSYNCED } from '../store/repositories/drive-roots';
import { RootMarkerError, readRootMarker, writeRootMarker } from './root-marker';

type ManagedStore = Pick<Store, 'driveRoots'>;

interface ManagedTarget {
  readonly label: string;
  readonly path: string;
  readonly ownerProfileId: string | null;
}

export const SHARED_LABEL = 'Shared';

const EMPTY_HEALTH = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

type ManagedLayout = Pick<HubLayout, 'home' | 'person'>;

function targetsOf(layout: ManagedLayout, profiles: readonly ProfileRow[]): ManagedTarget[] {
  return [
    { label: SHARED_LABEL, path: layout.home.drive, ownerProfileId: null },
    ...profiles.map((profile) => ({
      label: profile.name,
      path: layout.person(profile.id).drive,
      ownerProfileId: profile.id,
    })),
  ];
}

function newRoot(target: ManagedTarget): DriveRoot {
  return {
    id: randomUUID(),
    kind: 'managed',
    label: target.label,
    scope: target.ownerProfileId === null ? 'home' : 'person',
    ownerProfileId: target.ownerProfileId,
    path: target.path,
    readOnly: false,
    versions: true,
    volume: null,
    indexId: randomUUID(),
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: EMPTY_HEALTH,
    inPhotos: false,
    skipPatterns: [],
    includeHidden: false,
    synced: false,
    sync: UNSYNCED,
  };
}

async function ensureMarker(root: DriveRoot): Promise<void> {
  if (root.path === null) {
    return;
  }
  try {
    await readRootMarker(root.path);
  } catch (cause) {
    if (cause instanceof RootMarkerError && cause.failure === 'missing') {
      await writeRootMarker(root.path, root.id);
      return;
    }
    throw cause;
  }
}

async function ensureRoot(store: ManagedStore, target: ManagedTarget): Promise<DriveRoot> {
  await mkdir(target.path, { recursive: true, mode: 0o700 });
  const known = store.driveRoots.byPath(target.path);
  const root = known ?? store.driveRoots.insert(newRoot(target));
  await ensureMarker(root);
  if (known !== undefined && known.label !== target.label) {
    return store.driveRoots.update(known.id, { label: target.label });
  }
  return root;
}

export async function ensureManagedRoots(
  store: ManagedStore,
  layout: ManagedLayout,
  profiles: readonly ProfileRow[],
): Promise<readonly DriveRoot[]> {
  const ensured: DriveRoot[] = [];
  for (const target of targetsOf(layout, profiles)) {
    ensured.push(await ensureRoot(store, target));
  }
  return ensured;
}
