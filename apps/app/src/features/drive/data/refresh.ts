import type { QueryClient } from '@tanstack/react-query';
import { scanDriveRoot } from '../../../api/drive';
import { DRIVE_PREFIX } from '../../../queries/keys';

export async function refreshDrive(
  client: QueryClient,
  reconcileRootId: string | null,
): Promise<void> {
  const reconcile = reconcileRootId === null ? Promise.resolve() : scanDriveRoot(reconcileRootId);
  await Promise.all([client.refetchQueries({ queryKey: DRIVE_PREFIX, type: 'active' }), reconcile]);
}
