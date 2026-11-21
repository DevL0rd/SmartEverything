import type { DriveItem, DriveThumb } from '@smarteverything/domain';
import type { JobStore } from '../../src/photos/pipeline/job-units';
import type { DerivedStore } from '../../src/photos/pipeline/preview';
import type { StoreContext } from '../../src/store/context';
import type { DriveItemsRepository } from '../../src/store/repositories/drive-items';
import type { DriveMediaRepository } from '../../src/store/repositories/drive-media';
import type { DriveMediaJobsRepository } from '../../src/store/repositories/drive-media-jobs';

export function repositoryJobs(jobs: DriveMediaJobsRepository): JobStore {
  return {
    requeueRunning: () => Promise.resolve(jobs.requeueRunning()),
    enqueue: (request) => Promise.resolve(jobs.enqueue(request)),
    claim: (claims) => Promise.resolve(claims.map((claim) => jobs.claim(claim.kinds, claim.count))),
    complete: (id): Promise<void> => {
      jobs.complete(id);
      return Promise.resolve();
    },
    fail: (id, error): Promise<void> => {
      jobs.fail(id, error);
      return Promise.resolve();
    },
    report: (id, progress): Promise<void> => {
      jobs.report(id, progress);
      return Promise.resolve();
    },
    makeVisible: (itemId) => Promise.resolve(jobs.makeVisible(itemId)),
    removeOlderRevisions: (itemId, rev) => Promise.resolve(jobs.removeOlderRevisions(itemId, rev)),
  };
}

export interface DerivedRepositories {
  readonly context: StoreContext;
  readonly items: DriveItemsRepository;
  readonly media: DriveMediaRepository;
  readonly writeThumb: (itemId: string, thumb: DriveThumb) => void;
}

export function repositoryDerived(repositories: DerivedRepositories): DerivedStore {
  const { context, items, media, writeThumb } = repositories;
  const current = (target: {
    itemId: string;
    rev: number;
    kind: string;
  }): DriveItem | undefined => {
    const item = items.find(target.itemId, null);
    if (item?.kind !== target.kind || item.rev !== target.rev) return undefined;
    return media.find(item.id) === undefined ? undefined : item;
  };
  return {
    current: (target) => Promise.resolve(current(target)),
    record: (record) =>
      Promise.resolve(
        context.write(() => {
          if (current(record.target) === undefined) return false;
          if (record.thumb !== null) writeThumb(record.target.itemId, record.thumb);
          media.update(record.target.itemId, record.patch);
          return true;
        }),
      ),
  };
}
