import type { Logger } from '@smarteverything/logging';
import { hashHandler } from '../../drive/hasher';
import { jobKey, runnerOf, scanHandler, type DriveJob } from '../../drive/jobs';
import { metadataHandler } from '../../drive/metadata';
import type { RootAvailability } from '../../drive/volumes';
import type { StoreContext } from '../../store/context';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { Store } from '../../store/store';
import type { DriveRoot } from '@smarteverything/domain';

export interface DriveJobDeps {
  readonly store: Store;
  readonly context: StoreContext;
  readonly availability: (root: DriveRoot) => Promise<RootAvailability>;
  readonly log: Logger;
  readonly scannerScript: string;
  readonly hasherScript: string;
}

export interface DriveJobRunner {
  readonly keyOf: (job: DriveJob) => string;
  readonly run: (job: DriveJob, signal: AbortSignal) => Promise<void>;
}

export function driveJobHandlers(deps: DriveJobDeps): DriveJobRunner {
  const { store, availability, log } = deps;
  return {
    keyOf: jobKey,
    run: runnerOf({
      scan: scanHandler({ store, availability, workerScript: deps.scannerScript, log }),
      hash: hashHandler({ store, availability, workerScript: deps.hasherScript, log }),
      metadata: metadataHandler({
        store,
        media: new DriveMediaRepository(deps.context),
        availability,
        log,
      }),
    }),
  };
}
