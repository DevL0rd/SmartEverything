import type { DriveItem } from '@smarteverything/domain';
import type { DriveItemIdentity, DriveItemsRepository } from '../../store/repositories/drive-items';
import type { DriveRootsRepository, StoredDrive } from '../../store/repositories/drive-roots';
import type {
  DriveScrubCandidate,
  DriveScrubProgress,
  DriveScrubRepository,
  DriveScrubResult,
} from '../../store/repositories/drive-scrub';
import type { Sql } from '../../store/sql';
import { storeUnit } from '../../store/host/unit';
import { isFileItem } from '../file-item';

export interface ScrubStore {
  readonly driveRoots: Pick<DriveRootsRepository, 'list' | 'find' | 'update'>;
  readonly driveItems: Pick<DriveItemsRepository, 'find' | 'identityOf'>;
  readonly driveScrub: DriveScrubRepository;
  readonly context: { readonly sql: Pick<Sql, 'run'> };
}

export interface ScrubCandidate {
  readonly candidate: DriveScrubCandidate;
  readonly item: DriveItem;
  readonly identity: DriveItemIdentity;
}

export interface ScrubWindowInput {
  readonly rootId: string;
  readonly cutoff: string;
  readonly after: string | null;
  readonly limit: number;
}

export interface ScrubWindow {
  readonly candidates: readonly ScrubCandidate[];
  readonly last: string | null;
}

export function scrubWindowIn(store: ScrubStore, input: ScrubWindowInput): ScrubWindow {
  const window = store.driveScrub.next(input.rootId, input.cutoff, input.after, input.limit);
  const last = window.at(-1);
  const candidates = window.flatMap((candidate) => {
    const item = store.driveItems.find(candidate.itemId, null);
    const identity = item === undefined ? null : store.driveItems.identityOf(item.id);
    if (item === undefined || !isFileItem(item) || identity === null) return [];
    return [{ candidate, item, identity }];
  });
  return { candidates, last: last === undefined ? null : last.itemId };
}

export interface ScrubRecordInput {
  readonly rootId: string;
  readonly item: DriveItem;
  readonly result: DriveScrubResult;
}

export function scrubRecordIn(store: ScrubStore, input: ScrubRecordInput): void {
  const { item, result } = input;
  store.driveScrub.record(input.rootId, item.id, result);
  if (isFileItem(item) && item.integrity !== result) {
    store.context.sql.run(
      'record the file integrity',
      'update drive_items set integrity = $integrity where id = $id',
      { id: item.id, integrity: result },
    );
  }
}

function cutoffOf(root: StoredDrive): string {
  return root.health.lastScrubAt ?? '';
}

export interface ScrubOverview {
  readonly roots: readonly StoredDrive[];
  readonly progress: readonly DriveScrubProgress[];
  readonly lastFinishedAt: string | null;
  readonly corrupt: number;
}

export function scrubOverviewIn(store: ScrubStore): ScrubOverview {
  const roots = store.driveRoots.list();
  const moments = roots.flatMap((root) =>
    root.health.lastScrubAt === null ? [] : [root.health.lastScrubAt],
  );
  return {
    roots,
    progress: roots.map((root) => store.driveScrub.progress(root.id, cutoffOf(root))),
    lastFinishedAt: moments.length === 0 ? null : moments.reduce((a, b) => (a > b ? a : b)),
    corrupt: roots.reduce((sum, root) => sum + store.driveScrub.corrupt(root.id), 0),
  };
}

function shareOf(count: number, total: number): number {
  return total === 0 ? 1 : count / total;
}

function strictlyAfter(moment: string, floor: string | null): string {
  if (floor === null || moment > floor) return moment;
  return new Date(new Date(floor).getTime() + 1).toISOString();
}

export interface ScrubHealthInput {
  readonly rootId: string;
  readonly finished: boolean;
  readonly at: string;
}

export function scrubHealthIn(store: ScrubStore, input: ScrubHealthInput): void {
  const { rootId } = input;
  const root = store.driveRoots.find(rootId);
  if (root === undefined) return;
  const progress = store.driveScrub.progress(rootId, cutoffOf(root));
  const verified = store.driveScrub.verified(rootId);
  store.driveRoots.update(rootId, {
    health: {
      ...root.health,
      verifiedShare: Math.min(1, shareOf(verified, progress.total)),
      corrupt: progress.corrupt,
      lastScrubAt: input.finished
        ? strictlyAfter(input.at, store.driveScrub.lastVerifiedAt(rootId))
        : root.health.lastScrubAt,
    },
  });
}

export const DRIVE_SCRUB_WINDOW_UNIT = storeUnit((store, input: ScrubWindowInput) =>
  scrubWindowIn(store, input),
);

export const DRIVE_SCRUB_OVERVIEW_UNIT = storeUnit((store, _input: null) => scrubOverviewIn(store));

export const DRIVE_SCRUB_RECORD_UNIT = storeUnit((store, input: ScrubRecordInput) => {
  scrubRecordIn(store, input);
});

export const DRIVE_SCRUB_HEALTH_UNIT = storeUnit((store, input: ScrubHealthInput) => {
  scrubHealthIn(store, input);
});
