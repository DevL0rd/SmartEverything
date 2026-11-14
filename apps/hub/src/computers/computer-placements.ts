import {
  ApiError,
  type DrivePlacementStatus,
  type HubFrame,
  type NodeFrame,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DrivePlacements } from '../drive/placements';

export type PlacementStateFrame = Extract<NodeFrame, { readonly type: 'placement_state' }>;

export interface SessionPlacementsOptions {
  readonly placements: Pick<DrivePlacements, 'activeFor' | 'onDeviceChanged' | 'writeStatus'>;
  readonly send: (frame: HubFrame) => void;
  readonly mountsDemanded: (deviceId: string) => boolean;
  readonly log: Logger;
}

function statusOf(frame: PlacementStateFrame): DrivePlacementStatus {
  return {
    state: frame.state,
    tier: frame.tier,
    basicLimits: frame.basicLimits,
    readOnly: frame.readOnly,
    route: frame.route,
    cacheBytes: frame.cacheBytes,
    pinnedBytes: frame.pinnedBytes,
    openFiles: frame.openFiles,
    pendingUploads: frame.pendingUploads,
    needBytes: frame.needBytes,
    lastSyncedAt: frame.lastSyncedAt,
    errors: frame.errors,
    reason: frame.reason,
    reportedAt: frame.reportedAt,
  };
}

function sameTransition(current: DrivePlacementStatus, next: DrivePlacementStatus): boolean {
  return (
    current.state === next.state &&
    current.tier === next.tier &&
    current.readOnly === next.readOnly &&
    current.route === next.route &&
    current.reason === next.reason &&
    current.lastSyncedAt === next.lastSyncedAt &&
    JSON.stringify(current.errors) === JSON.stringify(next.errors) &&
    JSON.stringify(current.basicLimits) === JSON.stringify(next.basicLimits)
  );
}

export class SessionPlacements {
  private deviceId: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly options: SessionPlacementsOptions) {}

  open(deviceId: string): void {
    if (this.deviceId !== deviceId) {
      this.close();
      this.deviceId = deviceId;
      this.unsubscribe = this.options.placements.onDeviceChanged((changed) => {
        if (changed.includes(deviceId)) this.send(deviceId);
      });
    }
    this.send(deviceId);
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.deviceId = null;
  }

  received(frame: PlacementStateFrame): void {
    const { deviceId } = this;
    if (deviceId === null) {
      this.options.log.warn('computer.placement_state_before_hello', {
        placementId: frame.placementId,
      });
      return;
    }
    const next = statusOf(frame);
    const current = this.options.placements
      .activeFor(deviceId)
      .find((placement) => placement.id === frame.placementId)?.status;
    if (
      current !== undefined &&
      sameTransition(current, next) &&
      !this.options.mountsDemanded(deviceId)
    ) {
      return;
    }
    this.write(deviceId, frame.placementId, next);
  }

  private send(deviceId: string): void {
    const placements = this.options.placements.activeFor(deviceId);
    this.options.log.debug('computer.placements_sent', {
      deviceId,
      count: placements.length,
    });
    this.options.send({ type: 'placements', placements });
  }

  private write(deviceId: string, placementId: string, status: DrivePlacementStatus): void {
    try {
      this.options.placements.writeStatus(deviceId, placementId, status);
    } catch (cause) {
      if (!(cause instanceof ApiError)) throw cause;
      this.refuse(deviceId, placementId);
    }
  }

  private refuse(deviceId: string, placementId: string): void {
    this.options.log.warn('computer.placement_state_refused', { deviceId, placementId });
  }
}
