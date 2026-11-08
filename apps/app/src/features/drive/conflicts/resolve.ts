import type { QueryClient } from '@tanstack/react-query';
import type { DriveConflict, DriveConflictResolution } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { resolveDriveConflict } from '../../../api/drive';
import { notify } from '../../../components/toast-store';
import { invalidateDriveReach } from '../../nas/data/windows';
import { RESOLVE_FAILED, resolvedMessageOf, type ConflictSides } from './conflict-model';

const log = new Logger('app.drive');

export interface ResolveRequest {
  readonly conflict: DriveConflict;
  readonly resolution: DriveConflictResolution;
  readonly sides: ConflictSides;
}

export async function resolveConflict(
  client: QueryClient,
  { conflict, resolution, sides }: ResolveRequest,
): Promise<boolean> {
  try {
    const settled = await resolveDriveConflict({ conflictId: conflict.id, resolution });
    log.info('conflict.resolved', {
      conflictId: conflict.id,
      rootId: conflict.rootId,
      resolution: settled.resolution,
    });
    invalidateDriveReach(
      client,
      { rootIds: [conflict.rootId], folderIds: [], albumIds: [], months: null },
      ['conflicts'],
    );
    notify({ message: resolvedMessageOf(resolution, sides), tone: 'positive' });
    return true;
  } catch (error: unknown) {
    log.warn('conflict.resolve_failed', {
      conflictId: conflict.id,
      resolution,
      reason: String(error),
    });
    notify({ message: RESOLVE_FAILED, error, tone: 'critical' });
    return false;
  }
}
