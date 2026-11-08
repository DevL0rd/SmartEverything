import type { DrivePlacement } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';

export interface SyncTarget {
  readonly placementId: string;
  readonly rootId: string;
  readonly localPath: string;
}

export interface SyncWaiting {
  readonly needBytes: number;
  readonly pendingOps: number;
}

export interface SyncEnginePort {
  readonly start: (target: SyncTarget) => Promise<void>;
  readonly stop: (placementId: string) => Promise<void>;
  readonly waiting: (rootId: string) => Promise<SyncWaiting>;
}

export function syncTargets(placements: readonly DrivePlacement[]): readonly SyncTarget[] {
  return placements
    .filter(
      (placement) => placement.mode === 'synced' && placement.enabled && placement.hold === null,
    )
    .map((placement) => ({
      placementId: placement.id,
      rootId: placement.rootId,
      localPath: placement.localPath,
    }));
}

function sameTarget(first: SyncTarget, second: SyncTarget): boolean {
  return first.rootId === second.rootId && first.localPath === second.localPath;
}

export class SyncPlacementIntake {
  private readonly running = new Map<string, SyncTarget>();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly engine: SyncEnginePort,
    private readonly log: Logger,
  ) {}

  accept(placements: readonly DrivePlacement[]): Promise<void> {
    return this.enqueue(() => this.reconcile(syncTargets(placements)));
  }

  stopAll(): Promise<void> {
    return this.enqueue(() => this.reconcile([]));
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(work);
    return this.queue;
  }

  private async reconcile(wanted: readonly SyncTarget[]): Promise<void> {
    const byId = new Map(wanted.map((target) => [target.placementId, target]));
    for (const [id, running] of [...this.running]) {
      const next = byId.get(id);
      if (next === undefined || !sameTarget(running, next)) await this.halt(id);
    }
    for (const target of wanted) {
      if (!this.running.has(target.placementId)) await this.launch(target);
    }
  }

  private async halt(id: string): Promise<void> {
    this.running.delete(id);
    try {
      await this.engine.stop(id);
    } catch (cause) {
      this.log.error('drive_sync.placement_stop_failed', cause, { placement_id: id });
    }
  }

  private async launch(target: SyncTarget): Promise<void> {
    try {
      await this.engine.start(target);
      this.running.set(target.placementId, target);
    } catch (cause) {
      this.log.warn('drive_sync.placement_start_failed', {
        placement_id: target.placementId,
        error: messageOf(cause),
      });
    }
  }
}
