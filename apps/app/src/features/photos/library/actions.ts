import type { DriveChange } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { changeDrive } from '../../../api/drive';
import { notify } from '../../../components/toast-store';
import { count } from '../../../format/number';
import {
  BULK_BATCH,
  keptLine,
  runBulk,
  type BulkAnswer,
  type BulkOutcome,
} from '../../../store/bulk-run';
import {
  changeLocalCopies,
  LIVE_LOCAL_COPIES,
  restoreLocalCopiesWithNotice,
  type LocalCopies,
} from './local-copies';

const log = new Logger('app.photos');

export type Change = (body: DriveChange) => Promise<BulkAnswer>;

export function photosText(total: number): string {
  return total === 1 ? '1 photo' : `${count(total)} photos`;
}

interface Bulk {
  readonly label: string;
  readonly verb: string;
  readonly ids: readonly string[];
  readonly body: (batch: readonly string[]) => DriveChange;
  readonly failure: string;
  readonly onBatch?: (landed: readonly string[]) => void;
}

async function run(change: Change, bulk: Bulk): Promise<BulkOutcome | null> {
  try {
    const outcome = await runBulk({
      label: bulk.label,
      verb: bulk.verb,
      ids: bulk.ids,
      batch: BULK_BATCH,
      send: (batch) => change(bulk.body(batch)),
      ...(bulk.onBatch === undefined ? {} : { onBatch: bulk.onBatch }),
    });
    if (outcome.reason === null) return outcome;
    notify({
      message: bulk.failure,
      detail: keptLine(outcome, outcome.reason),
      tone: 'critical',
    });
    return outcome;
  } catch (error) {
    log.warn('photos.change_failed', { label: bulk.label });
    notify({ message: bulk.failure, error, tone: 'critical' });
    return null;
  }
}

function whole(outcome: BulkOutcome | null): boolean {
  return outcome !== null && outcome.reason === null;
}

export async function setFavourite(
  itemIds: readonly string[],
  on: boolean,
  change: Change = changeDrive,
): Promise<boolean> {
  return whole(
    await run(change, {
      label: on ? 'photos.favourite' : 'photos.unfavourite',
      verb: on ? 'Adding to favourites' : 'Removing from favourites',
      ids: itemIds,
      body: (batch) => ({ action: on ? 'star' : 'unstar', itemIds: batch }),
      failure: on ? 'Could not add to favourites' : 'Could not remove from favourites',
    }),
  );
}

export async function addToAlbum(
  itemIds: readonly string[],
  album: { readonly id: string; readonly title: string },
  change: Change = changeDrive,
): Promise<boolean> {
  const added = whole(
    await run(change, {
      label: 'photos.album_add',
      verb: `Adding to ${album.title}`,
      ids: itemIds,
      body: (batch) => ({ action: 'album_add', albumId: album.id, itemIds: batch }),
      failure: `Could not add to ${album.title}`,
    }),
  );
  if (added) notify({ message: `Added ${photosText(itemIds.length)} to ${album.title}` });
  return added;
}

export async function moveToTrash(
  itemIds: readonly string[],
  landed: (itemIds: readonly string[]) => void,
  change: Change = changeDrive,
  local: LocalCopies = LIVE_LOCAL_COPIES,
): Promise<boolean> {
  const outcome = await run(change, {
    label: 'photos.trash',
    verb: 'Deleting',
    ids: itemIds,
    body: (batch) => ({ action: 'trash', itemIds: batch }),
    failure: 'Could not move everything to trash',
    onBatch: landed,
  });
  if (outcome === null || outcome.landed.length === 0) return false;
  const moved = outcome.landed;
  const detail = await changeLocalCopies('trash', moved, local);
  if (outcome.reason !== null) return false;
  notify({
    message: `Moved ${photosText(moved.length)} to trash`,
    ...(detail === null ? {} : { detail }),
    undo: () => {
      background(restoreBoth(moved, change, local), 'photos.restore_failed');
    },
  });
  return true;
}

async function restoreBoth(
  itemIds: readonly string[],
  change: Change,
  local: LocalCopies,
): Promise<void> {
  const outcome = await run(change, {
    label: 'photos.restore',
    verb: 'Restoring',
    ids: itemIds,
    body: (batch) => ({ action: 'restore', itemIds: batch }),
    failure: 'Could not restore everything',
  });
  if (outcome !== null && outcome.landed.length > 0) {
    await restoreLocalCopiesWithNotice(outcome.landed, local);
  }
}
