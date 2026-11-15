import type { DriveChangeResult, DriveItem } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { errorFields } from '../../../design/log-tally';
import { count } from '../../../format/number';
import type { OpFollow } from '../../files';

const log = new Logger('app.drive');

export interface RestoreEnv {
  readonly readItem: (itemId: string) => Promise<DriveItem>;
  readonly labelOf: (rootId: string) => string | null;
  readonly open: (item: DriveItem) => void;
}

function folderNameOf(item: DriveItem, rootLabel: string | null): string | null {
  const folders = item.relPath.split('/').slice(0, -1);
  return folders.at(-1) ?? rootLabel;
}

export function restoredAsText(item: DriveItem, rootLabel: string | null): string {
  const folder = folderNameOf(item, rootLabel);
  return folder === null ? `Restored as ${item.name}` : `Restored as ${item.name} in ${folder}`;
}

export function restoredText(restored: number): string {
  return restored === 1 ? '1 item restored' : `${count(restored)} items restored`;
}

async function oneFollow(itemId: string, env: RestoreEnv): Promise<OpFollow | null> {
  try {
    const item = await env.readItem(itemId);
    return {
      message: restoredAsText(item, env.labelOf(item.rootId)),
      action: {
        label: 'Open',
        onPress: (): void => {
          env.open(item);
        },
      },
    };
  } catch (error: unknown) {
    log.warn('drive_trash.restored_item_unread', { itemId, ...errorFields(error) });
    return null;
  }
}

export async function restoredFollowOf(
  result: DriveChangeResult,
  env: RestoreEnv,
): Promise<OpFollow | null> {
  const [only, ...rest] = result.done;
  if (only === undefined) return null;
  const one =
    rest.length === 0 && only.resultItemId !== null
      ? await oneFollow(only.resultItemId, env)
      : null;
  return one ?? { message: restoredText(result.done.length), action: null };
}
