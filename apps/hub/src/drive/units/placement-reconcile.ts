import type {
  DrivePlacement,
  DrivePlacementHold,
  DrivePlacementStatus,
} from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { storeUnit } from '../../store/host/unit';
import { mayExport } from '../access';
import { placementAccess } from '../placement-access';
import { PlacementRules } from './placements';

export type PlacementScope =
  | { readonly kind: 'all' }
  | { readonly kind: 'device'; readonly deviceId: string }
  | { readonly kind: 'root'; readonly rootId: string; readonly foldersOnly: boolean }
  | { readonly kind: 'item'; readonly itemId: string }
  | { readonly kind: 'placement'; readonly placement: DrivePlacement };

export interface ReconcileInput {
  readonly scope: PlacementScope;
  readonly lineages: Readonly<Record<string, readonly string[]>>;
}

export interface Reconciled {
  readonly lineages: Readonly<Record<string, readonly string[] | null>>;
  readonly devices: readonly string[];
  readonly failures: readonly { readonly placementId: string; readonly error: string }[];
}

type Verdict =
  | { readonly kind: 'live'; readonly readOnly: boolean }
  | { readonly kind: 'gone' }
  | { readonly kind: 'held'; readonly hold: DrivePlacementHold };

type FolderState = 'live' | 'trashed' | 'gone';

export const HOLD_REASONS: Readonly<Record<DrivePlacementHold, string>> = {
  trashed: 'Folder is in the trash',
  no_access: 'No access to this folder any more',
  sync_off: 'Sync is off for this folder',
};

function stopped(status: DrivePlacementStatus, reason: string, at: string): DrivePlacementStatus {
  return { ...status, state: 'stopped', reason, mountPoint: null, reportedAt: at };
}

function restarting(status: DrivePlacementStatus, at: string): DrivePlacementStatus {
  return { ...status, state: 'starting', reason: null, mountPoint: null, reportedAt: at };
}

function placementsOf(store: Store, scope: PlacementScope): readonly DrivePlacement[] {
  switch (scope.kind) {
    case 'all':
      return store.drivePlacements.list();
    case 'device':
      return store.drivePlacements.forDevice(scope.deviceId);
    case 'root': {
      const placements = store.drivePlacements.forRoot(scope.rootId);
      return scope.foldersOnly
        ? placements.filter((placement) => placement.folderItemId !== null)
        : placements;
    }
    case 'item': {
      const item = store.driveItems.find(scope.itemId, null);
      return item === undefined ? [] : store.drivePlacements.forRoot(item.rootId);
    }
    case 'placement':
      return [scope.placement];
  }
}

class Reconciler {
  readonly lineages: Record<string, readonly string[] | null> = {};
  readonly rules: PlacementRules;

  constructor(
    private readonly store: Store,
    private readonly known: Readonly<Record<string, readonly string[]>>,
  ) {
    this.rules = new PlacementRules(store);
  }

  private lineageOf(placementId: string): readonly string[] | undefined {
    if (Object.hasOwn(this.lineages, placementId)) {
      return this.lineages[placementId] ?? undefined;
    }
    return this.known[placementId];
  }

  refreshLineage(placement: DrivePlacement): void {
    if (placement.folderItemId === null) return;
    const lineage: string[] = [];
    let current = this.store.driveItems.find(placement.folderItemId, null);
    while (current !== undefined && !lineage.includes(current.id)) {
      lineage.push(current.id);
      current =
        current.parentId === null ? undefined : this.store.driveItems.find(current.parentId, null);
    }
    if (lineage.length > 0) this.lineages[placement.id] = lineage;
  }

  verdict(placement: DrivePlacement): Verdict {
    const root = this.store.driveRoots.find(placement.rootId);
    if (root === undefined || this.store.computerNodes.personOf(placement.deviceId) === null) {
      return { kind: 'gone' };
    }
    const folder = this.folderState(placement);
    if (folder === 'gone') return { kind: 'gone' };
    if (folder === 'trashed') return { kind: 'held', hold: 'trashed' };
    const access = placementAccess(this.store, placement);
    if (access === 'none' || !mayExport(access, this.folderLocked(placement))) {
      return { kind: 'held', hold: 'no_access' };
    }
    return { kind: 'live', readOnly: access === 'view' };
  }

  private folderLocked(placement: DrivePlacement): boolean {
    if (placement.folderItemId === null) return false;
    return this.store.driveItems.find(placement.folderItemId, null)?.locked === true;
  }

  private folderState(placement: DrivePlacement): FolderState {
    if (placement.folderItemId === null) return 'live';
    if (this.store.driveItems.find(placement.folderItemId, null) !== undefined) return 'live';
    const lineage = this.lineageOf(placement.id);
    if (lineage === undefined) {
      const remembered =
        placement.hold === 'trashed' &&
        this.store.driveTrash.inRoot(placement.rootId, null, 1).entries.length > 0;
      return remembered ? 'trashed' : 'gone';
    }
    return lineage.some((id) => this.store.driveTrash.find(id) !== undefined) ? 'trashed' : 'gone';
  }

  apply(placement: DrivePlacement, verdict: Verdict): void {
    const now = this.store.context.now();
    if (verdict.kind === 'gone') {
      this.lineages[placement.id] = null;
      this.rules.remove(placement.id);
      return;
    }
    if (verdict.kind === 'live') {
      if (placement.status.readOnly !== verdict.readOnly) {
        this.rules.setReadOnly(placement.id, verdict.readOnly);
      }
      if (placement.hold === null) return;
      this.rules.setHold(placement.id, null);
      this.rules.writeStatus(
        placement.deviceId,
        placement.id,
        restarting({ ...placement.status, readOnly: verdict.readOnly }, now),
      );
      return;
    }
    const reason = HOLD_REASONS[verdict.hold];
    if (placement.hold !== verdict.hold) this.rules.setHold(placement.id, verdict.hold);
    const { status } = placement;
    if (status.state === 'stopped' && status.reason === reason) return;
    this.rules.writeStatus(placement.deviceId, placement.id, stopped(status, reason, now));
  }
}

export function reconcileIn(store: Store, input: ReconcileInput): Reconciled {
  const reconciler = new Reconciler(store, input.lineages);
  const failures: { placementId: string; error: string }[] = [];
  for (const placement of placementsOf(store, input.scope)) {
    try {
      reconciler.refreshLineage(placement);
      reconciler.apply(placement, reconciler.verdict(placement));
    } catch (cause) {
      failures.push({
        placementId: placement.id,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }
  return {
    lineages: reconciler.lineages,
    devices: reconciler.rules.changedDevices(),
    failures,
  };
}

export const DRIVE_PLACEMENT_RECONCILE_UNIT = storeUnit((store, input: ReconcileInput) =>
  reconcileIn(store, input),
);
