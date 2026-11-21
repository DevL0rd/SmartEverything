import { basename } from 'node:path';
import type { DriveIntent } from '../store/repositories/drive-intents';
import type { Store } from '../store/store';

export async function committedElsewhere(
  store: Pick<Store, 'host'>,
  intent: DriveIntent,
): Promise<boolean> {
  if (intent.op === 'trash')
    return (await store.host.call('driveTrash', 'find', basename(intent.toPath))) !== undefined;
  if (intent.op === 'restore')
    return (await store.host.call('driveTrash', 'find', basename(intent.fromPath))) === undefined;
  return false;
}
