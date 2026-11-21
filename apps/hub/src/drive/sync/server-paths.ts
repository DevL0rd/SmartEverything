import type { SyncScope } from './placement-scope';
import type { ConflictReason, SyncEnv } from './server-ops';

export function pathReason(
  env: SyncEnv,
  scope: SyncScope,
  wirePath: string,
): Promise<ConflictReason | null> {
  return env.store.host.read('driveSyncPathReason', { scope, wirePath });
}
