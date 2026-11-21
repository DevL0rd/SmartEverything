import type { DuplicateKeepBest, DuplicateStats } from '@smarteverything/domain';
import type { DriveActor } from '../drive/access';
import type { StoreHost } from '../store/host/host';
import type { DuplicatePage, DuplicateScope, KeepGroup } from './duplicate-queries';

export interface DuplicateChanges {
  readonly trash: (itemIds: readonly string[], actor: DriveActor) => Promise<void>;
  readonly star: (itemId: string, actor: DriveActor) => Promise<void>;
}

export interface KeepBestResult {
  readonly groups: number;
  readonly trashed: number;
  readonly reclaimedBytes: number;
}

export interface DuplicateStore {
  readonly groups: (
    actor: DriveActor,
    scope: DuplicateScope,
    cursor: string | undefined,
  ) => Promise<DuplicatePage>;
  readonly stats: (actor: DriveActor, scope: DuplicateScope) => Promise<DuplicateStats>;
  readonly keepPlan: (actor: DriveActor, request: DuplicateKeepBest) => Promise<KeepGroup[]>;
  readonly mergeAlbums: (actor: DriveActor, keeperId: string, loserIds: string[]) => Promise<void>;
  readonly hide: (actor: DriveActor, sha256s: readonly string[]) => Promise<void>;
}

export function hostedDuplicates(host: StoreHost): DuplicateStore {
  return {
    groups: (actor, scope, cursor) => host.read('photoDuplicateGroups', { actor, scope, cursor }),
    stats: (actor, scope) => host.read('photoDuplicateStats', { actor, scope }),
    keepPlan: (actor, request) => host.read('photoDuplicateKeepPlan', { actor, request }),
    mergeAlbums: (actor, keeperId, loserIds) =>
      host.write('photoDuplicateMergeAlbums', { actor, keeperId, loserIds }),
    hide: (actor, sha256s) => host.write('photoDuplicatesHide', { actor, sha256s }),
  };
}

export class DuplicatesService {
  constructor(
    private readonly store: DuplicateStore,
    private readonly changes: DuplicateChanges,
  ) {}

  groups(
    actor: DriveActor,
    scope: DuplicateScope,
    cursor: string | undefined,
  ): Promise<DuplicatePage> {
    return this.store.groups(actor, scope, cursor);
  }

  stats(actor: DriveActor, scope: DuplicateScope): Promise<DuplicateStats> {
    return this.store.stats(actor, scope);
  }

  async keepBest(actor: DriveActor, request: DuplicateKeepBest): Promise<KeepBestResult> {
    let trashed = 0;
    let reclaimedBytes = 0;
    const plan = await this.store.keepPlan(actor, request);
    for (const { keeper, losers } of plan) {
      const loserIds = losers.map((loser) => loser.id);
      await this.store.mergeAlbums(actor, keeper.id, loserIds);
      if (!keeper.starred && losers.some((loser) => loser.starred)) {
        await this.changes.star(keeper.id, actor);
      }
      await this.changes.trash(loserIds, actor);
      trashed += losers.length;
      reclaimedBytes += losers.reduce((sum, loser) => sum + loser.bytes, 0);
    }
    return { groups: plan.length, trashed, reclaimedBytes };
  }

  markNotDuplicates(actor: DriveActor, sha256s: readonly string[]): Promise<void> {
    return this.store.hide(actor, sha256s);
  }
}
