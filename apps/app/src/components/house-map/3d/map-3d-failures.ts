import type { Logger } from '@smarteverything/logging';
import type { Map3dFailure } from './map-3d-protocol';

export function createFailureReporter(
  log: Pick<Logger, 'warn'>,
): (failure: Map3dFailure, detail: string) => void {
  const reported = new Set<Map3dFailure>();
  return (failure, detail) => {
    if (reported.has(failure)) return;
    reported.add(failure);
    log.warn(`vacuum.map3d_${failure}_unavailable`, { detail });
  };
}
