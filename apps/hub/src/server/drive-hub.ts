import { join } from 'node:path';
import { ApiError, type DriveChange } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { PlacementLifecycle } from '../drive/placement-lifecycle';
import type { DrivePlacements } from '../drive/placements';
import type { DriveActor } from '../drive/access';
import type { ScrubCorruption } from '../drive/scrub';
import type { OwnerAlert } from '../extensions/owner-alerts';
import { DriveReadService } from '../drive/service-read';
import type { DriveWriteService } from '../drive/service-write';
import { systemDataSpace } from '../drive/data-space';
import { DuplicatesService, hostedDuplicates } from '../photos/duplicates';
import type { Store } from '../store/store';
import type { BuildOptions } from './build';
import type { ServerContext } from './context';
import { driveListings } from './handlers/drive-listings';
import { drivePlacementRoutes, type DrivePlacementRoutes } from './handlers/drive-placements';
import { startDrive, type RunningDrive } from './handlers/drive-start';
import { createDriveSurfaces } from './handlers/drive-surface-routes';
import { loadDriveSettings } from '../drive/settings';
import type { DriveDeps } from './handlers/drive-wiring';
import { startPhotoAi } from '../photos/ai/wiring';
import { photoHubRoutes, type PhotoHubInputs, type PhotoHubRoutes } from './handlers/photos-hub';
import type { PhotoAi } from '../photos/ai/service';
import { photoSharing, type PhotoSharingHub } from '../photos/sharing/wiring';
import { PlacesService, hostedPlaces, placesDatasetPath } from '../photos/places';
import { PhotoSearchIndexer } from '../photos/search-index';
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

  constructor(private readonly store: Pick<Store, 'host'>) {}

  attach(write: DriveWriteService): void {
    this.write = write;
  }

  async change(actor: DriveActor, change: DriveChange): Promise<void> {
    if (this.write === null) throw new DriveNotStartedError();
    const standing = await this.store.host.call('personAccess', 'standing', actor.profileId);
    const owner = standing.known && standing.role === 'owner';
    await this.write.change({ ...actor, owner, via: 'app', deviceId: null }, change);
  }
}

async function corruptionAlert(store: Store, corruption: ScrubCorruption): Promise<OwnerAlert> {
  const drive = await store.host.call('driveRoots', 'byId', corruption.rootId);
  const data = { rootId: corruption.rootId, itemId: corruption.itemId };
  if (corruption.cause === 'filesystem') {
    return {
      title: 'The disk could not read a drive file',
      body: 'The filesystem failed a checksum while reading a file back. Open the drive health page to see which.',
      data,
      ...(drive.scope === 'home' || drive.ownerProfileId === null
        ? {}
        : { person: drive.ownerProfileId }),
    };
  }
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

function depsOf(
  options: BuildOptions,
  context: ServerContext,
  duplicates: DuplicatesService,
): DriveDeps {
  const { store } = options;
  return {
    store,
    parts: {
      listings: driveListings({ store, read: new DriveReadService(store), duplicates }),
      removeLocationOutside: (sharedBy) => store.host.read('driveRemovesLocation', { sharedBy }),
      notifyCorruption: (corruption): void => {
        background(
          corruptionAlert(store, corruption).then((alert) => {
            options.alerts.raise(alert);
          }),
          'drive.corruption_alert_failed',
          { rootId: corruption.rootId, itemId: corruption.itemId },
        );
      },
    },
    layout: options.layout,
    localUrl: () => lanUrlOf(context),
    links: context.links,
    nodes: context.computerNodes,
    pushCommands: context.pushCommands,
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

function placementsOf(store: Store, placements: DrivePlacements, log: Logger): StartedPlacements {
  const lifecycle = new PlacementLifecycle({
    store,
    placements,
    log,
  });
  return { placements, stop: lifecycle.start() };
}

function permittedCameras(store: Store, context: ServerContext): () => readonly string[] {
  return () =>
    store.live.home.cameras
      .list()
      .map((camera) => camera.device_id)
      .filter((deviceId) => context.firewall.blockingAddress(deviceId) === null);
}

function duplicatesOf(store: Store, slot: WriteSlot): DuplicatesService {
  return new DuplicatesService(hostedDuplicates(store.host), {
    trash: (itemIds, actor) => slot.change(actor, { action: 'trash', itemIds: [...itemIds] }),
    star: (itemId, actor) => slot.change(actor, { action: 'star', itemIds: [itemId] }),
  });
}

function photoInputsOf(
  options: BuildOptions,
  context: ServerContext,
  drive: RunningDrive,
  shared: {
    readonly duplicates: DuplicatesService;
    readonly ai: PhotoAi;
    readonly sharing: PhotoSharingHub;
  },
): PhotoHubInputs {
  const { services, env } = drive.runtime;
  return {
    store: options.store,
    env,
    read: services.read,
    write: services.write,
    layout: options.layout,
    decoders: drive.runtime.media.decoders,
    openRouter: context.openRouter,
    duplicates: shared.duplicates,
    recordingPath: options.core.recordingPath,
    attachmentPath: (storagePath) => join(options.layout.system.ai.assistant, storagePath),
    permittedCameras: permittedCameras(options.store, context),
    ai: shared.ai,
    sharing: shared.sharing,
    links: context.links,
  };
}

interface PhotoServices {
  readonly shared: {
    readonly ai: PhotoAi;
    readonly sharing: PhotoSharingHub;
  };
  readonly stop: () => Promise<void>;
}

function startPhotoServices(
  options: BuildOptions,
  context: ServerContext,
  drive: RunningDrive,
  log: Logger,
): PhotoServices {
  const { store } = options;
  const photoAi = startPhotoAi({
    store,
    layout: options.layout,
    log,
    pipeline: drive.runtime.media,
    openRouter: context.openRouter,
  });
  const places = new PlacesService({
    store: hostedPlaces(store.host),
    datasetPath: placesDatasetPath,
    log,
  });
  places.load().catch((cause: unknown) => {
    log.error('photos.places_load_failed', cause);
  });
  const sharing = photoSharing({ store });
  const searchIndex = new PhotoSearchIndexer(store);
  searchIndex.start();
  return {
    shared: { ai: photoAi.ai, sharing },
    stop: async (): Promise<void> => {
      sharing.autoSaver.stop();
      await searchIndex.stop();
      await photoAi.stop();
    },
  };
}

export interface RunningDriveHub {
  readonly routes: RunningDrive['routes'] & DrivePlacementRoutes & PhotoHubRoutes;
  readonly rawRoutes: readonly RawRoute[];
  readonly placements: DrivePlacements;
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
  const placed = placementsOf(store, drive.runtime.placements, log);
  const { services, env } = drive.runtime;
  const photos = startPhotoServices(options, context, drive, log);
  const surfaces = createDriveSurfaces({
    store,
    activity: drive.runtime.activity,
    lanes: drive.runtime.lanes,
    env,
    services,
    nodes: context.computerNodes,
    log,
    settings: await loadDriveSettings(store),
  });
  const routes = {
    ...drive.routes,
    ...drivePlacementRoutes(placed.placements),
    ...photoHubRoutes(photoInputsOf(options, context, drive, { duplicates, ...photos.shared })),
  };
  const rawRoutes: readonly RawRoute[] = [...drive.rawRoutes, ...surfaces.routes];
  return {
    routes,
    rawRoutes,
    placements: placed.placements,
    revoke: surfaces.revoke,
    stop: async (): Promise<void> => {
      surfaces.stop();
      placed.stop();
      await photos.stop();
      await drive.stop();
    },
  };
}
