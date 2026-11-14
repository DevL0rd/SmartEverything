import type { DriveChange } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { changeDrive } from '../../../api/drive';
import { notify } from '../../../components/toast-store';
import { count } from '../../../format/number';

const log = new Logger('app.photos');

export type Change = (body: DriveChange) => Promise<{ readonly failed: readonly unknown[] }>;

function photosText(total: number): string {
  return total === 1 ? '1 photo' : `${count(total)} photos`;
}

async function run(change: Change, body: DriveChange, failure: string): Promise<boolean> {
  try {
    const result = await change(body);
    if (result.failed.length === 0) return true;
    notify({
      message: failure,
      detail: `${count(result.failed.length)} could not change.`,
      tone: 'critical',
    });
    return false;
  } catch (error) {
    log.warn('photos.change_failed', { action: body.action });
    notify({ message: failure, error, tone: 'critical' });
    return false;
  }
}

export async function setFavourite(
  itemIds: readonly string[],
  on: boolean,
  change: Change = changeDrive,
): Promise<boolean> {
  return run(
    change,
    { action: on ? 'star' : 'unstar', itemIds },
    on ? 'Could not add to favourites' : 'Could not remove from favourites',
  );
}

export async function addToAlbum(
  itemIds: readonly string[],
  album: { readonly id: string; readonly title: string },
  change: Change = changeDrive,
): Promise<boolean> {
  const added = await run(
    change,
    { action: 'album_add', albumId: album.id, itemIds },
    `Could not add to ${album.title}`,
  );
  if (added) notify({ message: `Added ${photosText(itemIds.length)} to ${album.title}` });
  return added;
}

export async function moveToTrash(
  itemIds: readonly string[],
  change: Change = changeDrive,
): Promise<boolean> {
  const moved = await run(change, { action: 'trash', itemIds }, 'Could not move to trash');
  if (!moved) return false;
  notify({
    message: `Moved ${photosText(itemIds.length)} to trash`,
    undo: () => {
      background(
        run(change, { action: 'restore', itemIds }, 'Could not restore'),
        'photos.restore_failed',
      );
    },
  });
  return true;
}
