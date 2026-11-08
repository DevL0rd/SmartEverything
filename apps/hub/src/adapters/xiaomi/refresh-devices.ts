import type { StateUpdate } from '@smarteverything/domain';
import { failureLine, type Logger } from '@smarteverything/logging';
import { mapBounded } from '../../providers/map-bounded';

export const REFRESH_CONCURRENCY = 6;

export interface RefreshTarget {
  readonly did: string;
  readonly readAll: () => Promise<{ readonly all: readonly StateUpdate[] }>;
}

async function refreshOne(target: RefreshTarget, log: Logger): Promise<readonly StateUpdate[]> {
  try {
    return (await target.readAll()).all;
  } catch (error) {
    log.warn('xiaomi_device.refresh_failed', { did: target.did, reason: failureLine(error) });
    return [];
  }
}

export async function refreshDevices(
  targets: readonly RefreshTarget[],
  log: Logger,
): Promise<readonly StateUpdate[]> {
  const refreshed = await mapBounded(targets, REFRESH_CONCURRENCY, (target) =>
    refreshOne(target, log),
  );
  return refreshed.flat();
}
