import type {
  CommittedNotice,
  DrivePlacement,
  DrivePlacementHold,
  DrivePlacementStatus,
  LiveChange,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { DrivePlacements } from './placements';
import { rootVisibleTo, type DriveActor } from './service-read';

export type LifecycleStore = Pick<
  Store,
  'drivePlacements' | 'driveRoots' | 'driveItems' | 'driveTrash' | 'computerNodes' | 'feed'
>;

export interface PlacementLifecycleDeps {
  readonly store: LifecycleStore;
  readonly placements: DrivePlacements;
  readonly nodeActor: (deviceId: string) => DriveActor;
  readonly now: () => string;
  readonly log: Logger;
}

type Verdict =
  | { readonly kind: 'live' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'held'; readonly hold: DrivePlacementHold };

type FolderState = 'live' | 'trashed' | 'gone';

const LIVE: Verdict = { kind: 'live' };
const GONE: Verdict = { kind: 'gone' };

export const HOLD_REASONS: Readonly<Record<DrivePlacementHold, string>> = {
  trashed: 'Folder is in the trash',
  no_access: 'No access to this folder any more',
  sync_off: 'Sync is off for this folder',
};

function held(hold: DrivePlacementHold): Verdict {
  return { kind: 'held', hold };
}

function stopped(status: DrivePlacementStatus, reason: string, at: string): DrivePlacementStatus {
  return { ...status, state: 'stopped', reason, reportedAt: at };
}

function restarting(status: DrivePlacementStatus, at: string): DrivePlacementStatus {
  return { ...status, state: 'starting', reason: null, reportedAt: at };
}

export class PlacementLifecycle {
  private readonly lineages = new Map<string, readonly string[]>();

  constructor(private readonly deps: PlacementLifecycleDeps) {}

  start(): () => void {
    this.reconcile(this.deps.store.drivePlacements.list());
    const stopRows = this.deps.store.feed.subscribe((change) => {
      this.onChange(change);
    });
    const stopNotices = this.deps.store.feed.subscribeNotices((notice) => {
      this.onNotice(notice);
    });
    return (): void => {
      stopRows();
      stopNotices();
    };
  }

  deviceUnpaired(deviceId: string): void {
    this.reconcile(this.deps.store.drivePlacements.forDevice(deviceId));
  }

  private onChange(change: LiveChange): void {
    const { drivePlacements } = this.deps.store;
    if (change.table === 'drive_roots') {
      const root = change.record ?? change.oldRecord;
      if (root !== null) this.reconcile(drivePlacements.forRoot(root.id));
    } else if (change.table === 'profiles') {
      if (change.operation !== 'INSERT') this.reconcile(drivePlacements.list());
    } else {
      this.onDeviceOrPlacement(change);
    }
  }

  private onDeviceOrPlacement(change: LiveChange): void {
    const { drivePlacements } = this.deps.store;
    if (change.table === 'devices' && change.operation === 'DELETE' && change.oldRecord !== null) {
      this.reconcile(drivePlacements.forDevice(change.oldRecord.id));
    } else if (change.table === 'drive_placements' && change.operation === 'INSERT') {
      if (change.record !== null) this.reconcile([change.record]);
    }
  }

  private onNotice(notice: CommittedNotice): void {
    if (notice.type !== 'drive_changed') return;
    for (const rootId of notice.rootIds) {
      this.reconcile(this.deps.store.drivePlacements.forRoot(rootId));
    }
  }

  private reconcile(placements: readonly DrivePlacement[]): void {
    for (const placement of placements) {
      try {
        this.refreshLineage(placement);
        this.apply(placement, this.verdict(placement));
      } catch (cause) {
        this.deps.log.error('drive.placement_lifecycle_failed', cause, {
          placementId: placement.id,
        });
      }
    }
  }

  private refreshLineage(placement: DrivePlacement): void {
    const { driveItems } = this.deps.store;
    if (placement.folderItemId === null) return;
    const lineage: string[] = [];
    let current = driveItems.find(placement.folderItemId);
    while (current !== undefined && !lineage.includes(current.id)) {
      lineage.push(current.id);
      current = current.parentId === null ? undefined : driveItems.find(current.parentId);
    }
    if (lineage.length > 0) this.lineages.set(placement.id, lineage);
  }

  private verdict(placement: DrivePlacement): Verdict {
    const { store, nodeActor } = this.deps;
    const root = store.driveRoots.find(placement.rootId);
    if (root === undefined || store.computerNodes.personOf(placement.deviceId) === null) {
      return GONE;
    }
    const folder = this.folderState(placement);
    if (folder === 'gone') return GONE;
    if (folder === 'trashed') return held('trashed');
    if (!rootVisibleTo(nodeActor(placement.deviceId), root)) return held('no_access');
    if (placement.mode === 'synced' && !root.synced) return held('sync_off');
    return LIVE;
  }

  private folderState(placement: DrivePlacement): FolderState {
    const { store } = this.deps;
    if (placement.folderItemId === null) return 'live';
    if (store.driveItems.find(placement.folderItemId) !== undefined) return 'live';
    const lineage = this.lineages.get(placement.id);
    if (lineage === undefined) {
      const remembered = placement.hold === 'trashed' && this.rootHoldsTrash(placement.rootId);
      return remembered ? 'trashed' : 'gone';
    }
    return lineage.some((id) => store.driveTrash.find(id) !== undefined) ? 'trashed' : 'gone';
  }

  private rootHoldsTrash(rootId: string): boolean {
    return this.deps.store.driveTrash.inRoot(rootId, null, 1).entries.length > 0;
  }

  private apply(placement: DrivePlacement, verdict: Verdict): void {
    const { placements, now } = this.deps;
    if (verdict.kind === 'gone') {
      this.lineages.delete(placement.id);
      placements.remove(placement.id);
    } else if (verdict.kind === 'live') {
      if (placement.hold === null) return;
      placements.setHold(placement.id, null);
      placements.writeStatus(placement.deviceId, placement.id, restarting(placement.status, now()));
    } else {
      this.hold(placement, verdict.hold);
    }
  }

  private hold(placement: DrivePlacement, hold: DrivePlacementHold): void {
    const { placements, now } = this.deps;
    const reason = HOLD_REASONS[hold];
    if (placement.hold !== hold) placements.setHold(placement.id, hold);
    const { status } = placement;
    if (status.state === 'stopped' && status.reason === reason) return;
    placements.writeStatus(placement.deviceId, placement.id, stopped(status, reason, now()));
  }
}
