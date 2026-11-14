import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { ApiError, PHOTOS_CLIENT_PREFS, type DriveChange } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { PlacementLifecycle } from '../drive/placement-lifecycle';
import { DrivePlacements } from '../drive/placements';
import type { DriveActor } from '../drive/access';
import type { ScrubCorruption } from '../drive/scrub';
import type { OwnerAlert } from '../extensions/owner-alerts';
import { DriveReadService } from '../drive/service-read';
import type { DriveWriteService } from '../drive/service-write';
import { systemDataSpace } from '../drive/data-space';
import { DuplicatesService } from '../photos/duplicates';
import type { Store } from '../store/store';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import { driveListings } from './handlers/drive-listings';
import { drivePlacementRoutes, type DrivePlacementRoutes } from './handlers/drive-placements';
import { startDrive, type RunningDrive } from './handlers/drive-start';
import { createDriveSurfaces } from './handlers/drive-surface-routes';
import type { DriveDeps } from './handlers/drive-wiring';
import { photoHubRoutes, type PhotoHubRoutes } from './handlers/photos-hub';
import type { RawRoute } from './http-server';

const WATCH_SETTLE_MS = 500;

class DriveNotStartedError extends Error {
  override readonly name = 'DriveNotStartedError';

  constructor() {
    super('A duplicate clean-up arrived before the drive finished starting.');
  }
}

class WriteSlot {
  private write: DriveWriteService | null = null;

  constructor(private readonly store: Pick<Store, 'personAccess'>) {}

  attach(write: DriveWriteService): void {
    this.write = write;
  }

  async change(actor: DriveActor, change: DriveChange): Promise<void> {
    if (this.write === null) throw new DriveNotStartedError();
    const standing = this.store.personAccess.standing(actor.profileId);
    const owner = standing.known && standing.role === 'owner';
    await this.write.change({ ...actor, owner, via: 'app', deviceId: null }, change);
  }
}

function corruptionAlert(store: Store, corruption: ScrubCorruption): OwnerAlert {
  const drive = store.driveRoots.byId(corruption.rootId);
  const data = { rootId: corruption.rootId, itemId: corruption.itemId };
  if (drive.scope === 'home') {
    return {
      title: 'A Shared Drive file changed on disk',
      body: `${corruption.relPath} no longer matches the copy the hub checked.`,
      data,
    };
  }
  return {
    title: 'A drive file changed on disk',
    body: 'A file no longer matches the copy the hub checked. Open the drive health page to see which.',
    data,
    ...(drive.ownerProfileId === null ? {} : { person: drive.ownerProfileId }),
  };
}

function lanUrlOf(context: ServerContext): string {
  const endpoints = context.connections?.metadata().endpoints ?? [];
  const reachable = endpoints.find((endpoint) => endpoint.kind === 'lan');
  if (reachable === undefined) {
    throw new ApiError(
      'conflict',
      'The hub has no home network address yet, so no link can be made.',
    );
  }
  return reachable.url;
}

function removesLocation(store: Store, sharedBy: string): boolean {
  const read = store.personal.pref(PHOTOS_CLIENT_PREFS.photos, {
    clientId: sharedBy,
    profileId: sharedBy,
  });
  if (read.status === 'invalid') throw new Error(read.reason);
  return read.value.removeLocationOutside;
}

function depsOf(
  options: BuildOptions,
  context: ServerContext,
  duplicates: DuplicatesService,
): DriveDeps {
  const { store } = options;
  return {
    store,
    parts: {
      context: store.context,
      database: store.database,
      conflicts: store.driveConflicts,
      listings: driveListings({ store, read: new DriveReadService(store), duplicates }),
      removeLocationOutside: (sharedBy) => removesLocation(store, sharedBy),
      notifyCorruption: (corruption): void => {
        options.alerts.raise(corruptionAlert(store, corruption));
      },
    },
    layout: options.layout,
    localUrl: () => lanUrlOf(context),
    links: context.links,
    nodes: context.computerNodes,
    probe: systemDataSpace,
    now: options.clock.now,
    log: options.log.forArea('hub.drive'),
    watchSettleMs: WATCH_SETTLE_MS,
  };
}

interface StartedPlacements {
  readonly placements: DrivePlacements;
  readonly stop: () => void;
}

function placementsOf(store: Store, log: Logger): StartedPlacements {
  const placements = new DrivePlacements({
    store,
    context: store.context,
    newId: randomUUID,
  });
  const lifecycle = new PlacementLifecycle({
    store,
    placements,
    now: (): string => store.now().toISOString(),
    log,
  });
  return { placements, stop: lifecycle.start() };
}

function permittedCameras(store: Store, context: ServerContext): () => readonly string[] {
  return () =>
    store.cameras
      .list()
      .map((camera) => camera.device_id)
      .filter((deviceId) => context.firewall.blockingAddress(deviceId) === null);
}

function duplicatesOf(store: Store, slot: WriteSlot): DuplicatesService {
  return new DuplicatesService(store.context, {
    trash: (itemIds, actor) => slot.change(actor, { action: 'trash', itemIds: [...itemIds] }),
    star: (itemId, actor) => slot.change(actor, { action: 'star', itemIds: [itemId] }),
  });
}

export interface RunningDriveHub {
  readonly routes: RunningDrive['routes'] & DrivePlacementRoutes & PhotoHubRoutes;
  readonly rawRoutes: readonly RawRoute[];
  readonly revoke: (deviceId: string) => void;
  readonly stop: () => Promise<void>;
}

export async function startDriveHub(
  options: BuildOptions,
  context: ServerContext,
): Promise<RunningDriveHub> {
  const { store } = options;
  const slot = new WriteSlot(store);
  const duplicates = duplicatesOf(store, slot);
  const drive = await startDrive(depsOf(options, context, duplicates));
  slot.attach(drive.runtime.services.write);
  const log = options.log.forArea('hub.drive');
  const placed = placementsOf(store, log);
  const { services, env } = drive.runtime;
  const surfaces = createDriveSurfaces({ store, env, services, nodes: context.computerNodes, log });
  const routes = {
    ...drive.routes,
    ...drivePlacementRoutes(store, placed.placements),
    ...photoHubRoutes({
      store,
      env,
      read: services.read,
      duplicates,
      recordingPath: options.core.recordingPath,
      attachmentPath: (storagePath) => join(options.layout.system.ai.assistant, storagePath),
      permittedCameras: permittedCameras(store, context),
    }),
  };
  const rawRoutes: readonly RawRoute[] = [...drive.rawRoutes, ...surfaces.routes];
  return {
    routes,
    rawRoutes,
    revoke: surfaces.revoke,
    stop: async (): Promise<void> => {
      surfaces.stop();
      placed.stop();
      await drive.stop();
    },
  };
}
