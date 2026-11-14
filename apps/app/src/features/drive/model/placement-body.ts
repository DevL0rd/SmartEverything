import type { DrivePlacementMode, DrivePlacementSet } from '@smarteverything/domain';

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
  readonly mode: DrivePlacementMode;
  readonly localPath: string;
  readonly sync?: SyncSettings;
  readonly enabled?: boolean;
}

export function placementBodyOf(plan: PlacementPlan): DrivePlacementSet {
  const base = {
    deviceId: plan.deviceId,
    rootId: plan.target.rootId,
    folderItemId: plan.target.folderItemId,
    mode: plan.mode,
    localPath: plan.localPath,
    enabled: plan.enabled ?? true,
  };
  return plan.mode === 'synced' ? { ...base, ...(plan.sync ?? DEFAULT_SYNC_SETTINGS) } : base;
}
