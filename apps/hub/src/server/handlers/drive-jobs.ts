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
import { hostScanPort } from '../../drive/scan-port';
import { hostMetadata, metadataHandler } from '../../drive/metadata';
import { loadDriveSettings } from '../../drive/settings';
import type { RootAvailability } from '../../drive/root-marker';
import type { DriveRootLanes } from '../../drive/root-lanes';
import type { Store } from '../../store/store';
import type { StoredDrive } from '../../store/repositories/drive-roots';

export interface DriveJobDeps {
  readonly store: Store;
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

export async function mountedRoot(store: Pick<Store, 'host'>, rootId: string): Promise<boolean> {
  const placements = await store.host.call('drivePlacements', 'forRoot', rootId);
  return placements.some((placement) => placement.mode === 'mounted');
}

export function driveJobHandlers(deps: DriveJobDeps): DriveJobRunner {
  const { store, availability, log } = deps;
  const scanning: ScanEnvironment = {
    scans: hostScanPort(store),
    feed: store.feed,
    now: store.now,
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
      hash: hashHandler({
        store,
        availability,
        start: (rootId) => store.host.read('driveHashStart', { rootId }),
        backlog: (rootId) => store.host.read('hashBacklog', { rootId }),
        record: (input) => store.host.write('driveHashRecord', input),
        health: (input) => store.host.write('driveHashHealth', input),
        workerScript: deps.hasherScript,
        log,
      }),
      metadata: metadataHandler({
        ...hostMetadata(store),
        settings: () => loadDriveSettings(store),
        hubZone: async () => (await store.host.read('settingsRow', null)).time_zone,
        feed: store.feed,
        availability,
        workerScript: deps.metadataScript,
        log,
      }),
      text: textHandler(deps.text, deps.textCursors),
    }),
  };
}
