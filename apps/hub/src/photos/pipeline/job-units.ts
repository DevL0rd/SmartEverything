import { z } from 'zod';
import { storeUnit } from '../../store/host/unit';
import {
  DriveMediaJobsRepository,
  type DriveMediaJob,
  type DriveMediaJobKind,
  type DriveMediaJobRequest,
} from '../../store/repositories/drive-media-jobs';
import type { StoreHost } from '../../store/host/host';

export interface JobClaim {
  readonly kinds: readonly DriveMediaJobKind[];
  readonly count: number;
}

export interface JobStore {
  readonly requeueRunning: () => Promise<number>;
  readonly enqueue: (request: DriveMediaJobRequest) => Promise<DriveMediaJob>;
  readonly claim: (claims: readonly JobClaim[]) => Promise<DriveMediaJob[][]>;
  readonly complete: (id: string) => Promise<void>;
  readonly fail: (id: string, error: string) => Promise<void>;
  readonly report: (id: string, progress: number) => Promise<void>;
  readonly makeVisible: (itemId: string) => Promise<number>;
  readonly removeOlderRevisions: (itemId: string, rev: number) => Promise<number>;
}

export const PHOTO_JOBS_REQUEUE_UNIT = storeUnit((store, _input: null) =>
  new DriveMediaJobsRepository(store.context).requeueRunning(),
);

export const PHOTO_JOB_ENQUEUE_UNIT = storeUnit((store, input: DriveMediaJobRequest) =>
  new DriveMediaJobsRepository(store.context).enqueue(input),
);

export const PHOTO_JOBS_CLAIM_UNIT = storeUnit((store, input: readonly JobClaim[]) => {
  const jobs = new DriveMediaJobsRepository(store.context);
  return input.map((claim) => jobs.claim(claim.kinds, claim.count));
});

export const PHOTO_JOB_COMPLETE_UNIT = storeUnit((store, input: { readonly id: string }) => {
  new DriveMediaJobsRepository(store.context).complete(input.id);
});

export const PHOTO_JOB_FAIL_UNIT = storeUnit(
  (store, input: { readonly id: string; readonly error: string }) => {
    new DriveMediaJobsRepository(store.context).fail(input.id, input.error);
  },
);

export const PHOTO_JOB_REPORT_UNIT = storeUnit(
  (store, input: { readonly id: string; readonly progress: number }) => {
    new DriveMediaJobsRepository(store.context).report(input.id, input.progress);
  },
);

export const PHOTO_JOBS_VISIBLE_UNIT = storeUnit((store, input: { readonly itemId: string }) =>
  new DriveMediaJobsRepository(store.context).makeVisible(input.itemId),
);

export const PHOTO_JOBS_OLDER_UNIT = storeUnit(
  (store, input: { readonly itemId: string; readonly rev: number }) =>
    new DriveMediaJobsRepository(store.context).removeOlderRevisions(input.itemId, input.rev),
);

export interface JobCandidate {
  readonly id: string;
  readonly rev: number;
  readonly kind: 'preview' | 'poster' | 'playable';
}

const CURRENT = z.strictObject({ found: z.literal(1) });

export const PHOTO_JOBS_RECONCILE_UNIT = storeUnit(
  (store, input: readonly JobCandidate[]): DriveMediaJob[] => {
    const jobs = new DriveMediaJobsRepository(store.context);
    return input.flatMap((candidate) => {
      const current = store.context.sql.get(
        CURRENT,
        'select 1 as found from drive_items where id = $itemId and rev = $rev',
        { itemId: candidate.id, rev: candidate.rev },
      );
      if (current === undefined) return [];
      jobs.removeOlderRevisions(candidate.id, candidate.rev);
      return [jobs.enqueue({ kind: candidate.kind, itemId: candidate.id, rev: candidate.rev })];
    });
  },
);

export function hostedJobs(host: StoreHost): JobStore {
  return {
    requeueRunning: () => host.write('photoJobsRequeue', null),
    enqueue: (request) => host.write('photoJobEnqueue', request),
    claim: (claims) => host.write('photoJobsClaim', claims),
    complete: (id) => host.write('photoJobComplete', { id }),
    fail: (id, error) => host.write('photoJobFail', { id, error }),
    report: (id, progress) => host.write('photoJobReport', { id, progress }),
    makeVisible: (itemId) => host.write('photoJobsVisible', { itemId }),
    removeOlderRevisions: (itemId, rev) => host.write('photoJobsOlder', { itemId, rev }),
  };
}
