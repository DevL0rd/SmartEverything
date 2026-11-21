import type { CommittedNotice, DriveGrant, DriveRoot, LiveChange } from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import { Coalesced } from '../store/reader';
import type { Store } from '../store/store';
import type { DrivePlacements } from './placements';
import type { PlacementScope } from './units/placement-reconcile';

export type LifecycleStore = Pick<Store, 'host' | 'feed'>;

export interface PlacementLifecycleDeps {
  readonly store: LifecycleStore;
  readonly placements: DrivePlacements;
  readonly log: Logger;
}

type RootChange = Extract<LiveChange, { readonly table: 'drive_roots' }>;

function withoutTotals(root: DriveRoot): string {
  const { items: _items, folders: _folders, bytes: _bytes, ...rest } = root;
  return JSON.stringify(rest);
}

function totalsOnly(change: RootChange): boolean {
  const { record, oldRecord } = change;
  return (
    change.operation === 'UPDATE' &&
    record !== null &&
    oldRecord !== null &&
    withoutTotals(record) === withoutTotals(oldRecord)
  );
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

export class PlacementLifecycle {
  private readonly lineages = new Map<string, readonly string[]>();
  private readonly changedRoots = new Set<string>();
  private readonly pass: Coalesced;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly deps: PlacementLifecycleDeps) {
    this.pass = new Coalesced(
      () => this.reconcileChangedRoots(),
      (cause) => {
        deps.log.error('drive.placement_lifecycle_failed', cause);
      },
    );
  }

  async settled(): Promise<void> {
    await this.pass.idle();
    await this.tail;
  }

  start(): () => void {
    this.reconcile({ kind: 'all' });
    const stopRows = this.deps.store.feed.subscribe((change) => {
      this.onChange(change);
    });
    const stopNotices = this.deps.store.feed.subscribeNotices((notice) => {
      this.onNotice(notice);
    });
    return (): void => {
      stopRows();
      stopNotices();
      background(this.pass.stop(), 'drive.placement_lifecycle_stop_failed');
    };
  }

  deviceUnpaired(deviceId: string): void {
    this.reconcile({ kind: 'device', deviceId });
  }

  private onChange(change: LiveChange): void {
    if (change.table === 'drive_roots') {
      const root = change.record ?? change.oldRecord;
      if (root !== null && !totalsOnly(change)) {
        this.reconcile({ kind: 'root', rootId: root.id, foldersOnly: false });
      }
    } else if (change.table === 'drive_grants') {
      this.onGrant(change.record ?? change.oldRecord);
    } else if (change.table === 'profiles') {
      if (change.operation !== 'INSERT') this.reconcile({ kind: 'all' });
    } else {
      this.onDeviceOrPlacement(change);
    }
  }

  private onGrant(grant: DriveGrant | null): void {
    if (grant === null) return;
    this.reconcile({ kind: 'item', itemId: grant.itemId });
  }

  private onDeviceOrPlacement(change: LiveChange): void {
    if (change.table === 'devices' && change.operation === 'DELETE' && change.oldRecord !== null) {
      this.reconcile({ kind: 'device', deviceId: change.oldRecord.id });
    } else if (change.table === 'drive_placements' && change.operation === 'INSERT') {
      if (change.record !== null) this.reconcile({ kind: 'placement', placement: change.record });
    }
  }

  private onNotice(notice: CommittedNotice): void {
    if (notice.type !== 'drive_changed') return;
    for (const rootId of notice.rootIds) this.changedRoots.add(rootId);
    this.pass.trigger();
  }

  private async reconcileChangedRoots(): Promise<void> {
    await nextTurn();
    const roots = [...this.changedRoots];
    this.changedRoots.clear();
    for (const rootId of roots) {
      await this.reconciled({ kind: 'root', rootId, foldersOnly: true });
    }
  }

  private reconcile(scope: PlacementScope): void {
    const next = this.tail.then(() => this.reconciled(scope));
    this.tail = next.catch((cause: unknown) => {
      this.deps.log.error('drive.placement_lifecycle_failed', cause);
    });
  }

  private async reconciled(scope: PlacementScope): Promise<void> {
    const result = await this.deps.store.host.write('drivePlacementReconcile', {
      scope,
      lineages: Object.fromEntries(this.lineages),
    });
    for (const [placementId, lineage] of Object.entries(result.lineages)) {
      if (lineage === null) this.lineages.delete(placementId);
      else this.lineages.set(placementId, lineage);
    }
    for (const failure of result.failures) {
      this.deps.log.error('drive.placement_lifecycle_failed', new Error(failure.error), {
        placementId: failure.placementId,
      });
    }
    this.deps.placements.changed(result.devices);
  }
}
