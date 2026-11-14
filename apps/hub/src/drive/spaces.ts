import type { DriveRoot, DriveRootScope, ProfileRow } from '@smarteverything/domain';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import type { HubLayout } from '../data-layout';
import type { Store } from '../store/store';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { RootMarkerError, readRootMarker, writeRootMarker } from './root-marker';

type SpacesStore = Pick<Store, 'driveRoots'>;

type SpacesLayout = Pick<HubLayout, 'home' | 'person'>;

interface Space {
  readonly scope: DriveRootScope;
  readonly ownerProfileId: string | null;
  readonly path: string;
}

export class DriveSpaceMissingError extends Error {
  override readonly name = 'DriveSpaceMissingError';

  constructor(
    readonly scope: DriveRootScope,
    readonly ownerProfileId: string | null,
  ) {
    super(
      scope === 'home'
        ? 'The Shared Drive does not exist yet; the Hub creates it at start.'
        : `The person ${String(ownerProfileId)} has no drive yet; the Hub creates it with the profile.`,
    );
  }
}

const EMPTY_HEALTH = {
  hashedShare: 0,
  verifiedShare: 0,
  corrupt: 0,
  lastScrubAt: null,
  lastBackupAt: null,
} as const;

function spacesOf(layout: SpacesLayout, profiles: readonly ProfileRow[]): Space[] {
  return [
    { scope: 'home', ownerProfileId: null, path: layout.home.drive },
    ...profiles.map((profile): Space => ({
      scope: 'person',
      ownerProfileId: profile.id,
      path: layout.person(profile.id).drive,
    })),
  ];
}

function newDrive(space: Space): DriveRoot {
  return {
    id: randomUUID(),
    scope: space.scope,
    ownerProfileId: space.ownerProfileId,
    indexId: randomUUID(),
    state: 'ready',
    stateReason: null,
    items: 0,
    folders: 0,
    bytes: 0,
    scannedAt: null,
    health: EMPTY_HEALTH,
    versions: false,
    skipPatterns: [],
    includeHidden: false,
  };
}

async function ensureMarker(path: string, id: string): Promise<void> {
  try {
    await readRootMarker(path);
  } catch (cause) {
    if (cause instanceof RootMarkerError && cause.failure === 'missing') {
      await writeRootMarker(path, id);
      return;
    }
    throw cause;
  }
}

async function ensureDrive(store: SpacesStore, space: Space): Promise<StoredDrive> {
  await mkdir(space.path, { recursive: true, mode: 0o700 });
  const drive =
    store.driveRoots.byIdentity(space.scope, space.ownerProfileId) ??
    store.driveRoots.insert(newDrive(space));
  await ensureMarker(space.path, drive.id);
  return drive;
}

export async function ensureDrives(
  store: SpacesStore,
  layout: SpacesLayout,
  profiles: readonly ProfileRow[],
): Promise<readonly StoredDrive[]> {
  const ensured: StoredDrive[] = [];
  for (const space of spacesOf(layout, profiles)) {
    ensured.push(await ensureDrive(store, space));
  }
  return ensured;
}

export function personalDrive(store: SpacesStore, profileId: string): StoredDrive {
  const drive = store.driveRoots.byIdentity('person', profileId);
  if (drive === undefined) throw new DriveSpaceMissingError('person', profileId);
  return drive;
}

export function sharedDrive(store: SpacesStore): StoredDrive {
  const drive = store.driveRoots.byIdentity('home', null);
  if (drive === undefined) throw new DriveSpaceMissingError('home', null);
  return drive;
}
