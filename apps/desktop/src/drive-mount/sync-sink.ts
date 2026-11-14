import type { Logger } from '@smarteverything/logging';
import type { EngineSink } from '../drive-sync/engine.js';

export function engineSinkOf(placementId: string, changed: () => void, log: Logger): EngineSink {
  return {
    pushed: changed,
    pulled: changed,
    contended: changed,
    progress: changed,
    blocked: (result): void => {
      log.warn('drive_sync.blocked', { placement_id: placementId, path: result.relPath });
      changed();
    },
    conflict: (result): void => {
      log.info('drive_sync.conflict', { placement_id: placementId, kind: result.kind });
      changed();
    },
    skipped: changed,
    failed: (failure): void => {
      log.warn('drive_sync.failed', { placement_id: placementId, error: failure.message });
      changed();
    },
  };
}
