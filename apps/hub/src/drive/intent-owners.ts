import { basename } from 'node:path';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { Store } from '../store/store';

export function committedElsewhere(store: Pick<Store, 'driveTrash'>, intent: DriveIntent): boolean {
  if (intent.op === 'trash') return store.driveTrash.find(basename(intent.toPath)) !== undefined;
  if (intent.op === 'restore') return store.driveTrash.find(basename(intent.fromPath)) === undefined;
  return false;
}
