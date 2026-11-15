import type { DrivePlacementSet } from '@smarteverything/domain';

export interface PlacementTarget {
  readonly rootId: string;
  readonly folderItemId: string | null;
}

export interface SyncSettings {
  readonly excluded: readonly string[];
  readonly ignorePatterns: readonly string[];
  readonly conflictCopies: boolean;
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  excluded: [],
  ignorePatterns: [],
  conflictCopies: true,
};

export interface PlacementPlan {
  readonly deviceId: string;
  readonly target: PlacementTarget;
  readonly localPath: string;
  readonly sync?: SyncSettings;
  readonly enabled?: boolean;
}

export function placementBodyOf(plan: PlacementPlan): DrivePlacementSet {
  return {
    deviceId: plan.deviceId,
    rootId: plan.target.rootId,
    folderItemId: plan.target.folderItemId,
    localPath: plan.localPath,
    enabled: plan.enabled ?? true,
    ...(plan.sync ?? DEFAULT_SYNC_SETTINGS),
  };
}
