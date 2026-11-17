import type { Logger } from '@smarteverything/logging';
import { textHandler, type TextCursors, type TextEnvironment } from '../../drive/content/text-job';
import { hashHandler } from '../../drive/hasher';
import {
  jobKey,
  mergeJobs,
  runnerOf,
  scanHandler,
  type DriveJob,
  type ScanEnvironment,
} from '../../drive/jobs';
import { reflectHandler } from '../../drive/reflect';
import { metadataHandler } from '../../drive/metadata';
import { zonePicker } from '../../drive/metadata-zone';
import type { RootAvailability } from '../../drive/root-marker';
import type { DriveRootLanes } from '../../drive/root-lanes';
import type { StoreContext } from '../../store/context';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import { PhotoDeviceZonesRepository } from '../../store/repositories/photo-device-zones';
import type { Store } from '../../store/store';
import type { StoredDrive } from '../../store/repositories/drive-roots';

export interface DriveJobDeps {
  readonly store: Store;
  readonly context: StoreContext;
  readonly availability: (root: StoredDrive) => Promise<RootAvailability>;
  readonly log: Logger;
  readonly scannerScript: string;
  readonly hasherScript: string;
  readonly metadataScript: string;
  readonly text: TextEnvironment;
  readonly textCursors: TextCursors;
  readonly lanes: DriveRootLanes;
}

export interface DriveJobRunner {
  readonly keyOf: (job: DriveJob) => string;
  readonly merge: (queued: DriveJob, next: DriveJob) => DriveJob;
  readonly run: (job: DriveJob, signal: AbortSignal) => Promise<void>;
}

export function mountedRoot(store: Pick<Store, 'drivePlacements'>, rootId: string): boolean {
  return store.drivePlacements.forRoot(rootId).some((placement) => placement.mode === 'mounted');
}

export function driveJobHandlers(deps: DriveJobDeps): DriveJobRunner {
  const { store, availability, log } = deps;
  const scanning: ScanEnvironment = {
    store,
    availability,
    mounted: (rootId) => mountedRoot(store, rootId),
    workerScript: deps.scannerScript,
    log,
    lanes: deps.lanes,
  };
  return {
    keyOf: jobKey,
    merge: mergeJobs,
    run: runnerOf({
      scan: scanHandler(scanning),
      reflect: reflectHandler(scanning),
      hash: hashHandler({ store, availability, workerScript: deps.hasherScript, log }),
      metadata: metadataHandler({
        store,
        media: new DriveMediaRepository(deps.context),
        availability,
        zones: zonePicker(
          new PhotoDeviceZonesRepository(deps.context),
          () => store.settings.read().time_zone,
        ),
        workerScript: deps.metadataScript,
        log,
      }),
      text: textHandler(deps.text, deps.textCursors),
    }),
  };
}
