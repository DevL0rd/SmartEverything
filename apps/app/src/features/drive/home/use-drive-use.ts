import type { DriveRoot, DriveUsageTotals } from '@smarteverything/domain';
import { useDriveUsage, useViewerId } from '../data';
import type { DriveUse, QuotaState } from './hero-model';

export interface DriveUseInput {
  readonly root: Pick<DriveRoot, 'bytes'>;
  readonly viewerId: string | null;
  readonly usage: readonly DriveUsageTotals[] | undefined;
}

export function usedBytesOf(usage: Pick<DriveUsageTotals, 'live' | 'versions' | 'trash'>): number {
  return usage.live + usage.versions + usage.trash;
}

function quotaOf(own: DriveUsageTotals | undefined): QuotaState {
  if (own === undefined) return { kind: 'unknown' };
  return own.quota === null ? { kind: 'none' } : { kind: 'limit', bytes: own.quota };
}

export function driveUseOf(input: DriveUseInput): DriveUse {
  const own = input.usage?.find(
    (row) => input.viewerId !== null && row.profileId === input.viewerId,
  );
  return {
    used: own === undefined ? input.root.bytes : usedBytesOf(own),
    quota: quotaOf(own),
  };
}

export function useDriveUse(root: Pick<DriveRoot, 'bytes'>): DriveUse {
  const viewerId = useViewerId();
  const usage = useDriveUsage().data;
  return driveUseOf({ root, viewerId, usage });
}
