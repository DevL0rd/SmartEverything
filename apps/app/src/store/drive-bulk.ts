import type { DriveChange, DriveChangeResult } from '@smarteverything/domain';
import { changeDrive } from '../api/drive';
import { BULK_BATCH, runBulk, type BulkOutcome } from './bulk-run';

export interface DriveBulk {
  readonly label: string;
  readonly verb: string;
  readonly ids: readonly string[];
  readonly body: (batch: readonly string[]) => DriveChange;
}

export interface DriveBulkResult {
  readonly result: DriveChangeResult;
  readonly outcome: BulkOutcome;
}

export type DriveChanger = (body: DriveChange) => Promise<DriveChangeResult>;

export async function changeDriveInBatches(
  bulk: DriveBulk,
  change: DriveChanger = changeDrive,
): Promise<DriveBulkResult> {
  const done: DriveChangeResult['done'][number][] = [];
  const failed: DriveChangeResult['failed'][number][] = [];
  const conflicts: DriveChangeResult['conflicts'][number][] = [];
  const outcome = await runBulk({
    label: bulk.label,
    verb: bulk.verb,
    ids: bulk.ids,
    batch: BULK_BATCH,
    send: async (batch) => {
      const answer = await change(bulk.body(batch));
      done.push(...answer.done);
      failed.push(...answer.failed);
      conflicts.push(...answer.conflicts);
      return answer;
    },
  });
  return { result: { done, failed, conflicts }, outcome };
}

const VERBS: Readonly<Record<DriveChange['action'], string>> = {
  new_folder: 'Creating',
  rename: 'Renaming',
  move: 'Moving',
  copy: 'Copying',
  star: 'Starring',
  unstar: 'Unstarring',
  trash: 'Deleting',
  restore: 'Restoring',
  delete_now: 'Deleting for good',
  album_add: 'Adding to album',
  album_remove: 'Removing from album',
  keep_source_item: 'Keeping',
};

function copyIdsFor(
  body: Extract<DriveChange, { readonly action: 'copy' }>,
  itemIds: readonly string[],
): readonly string[] | undefined {
  const { copyIds } = body;
  if (copyIds === undefined) return undefined;
  const copyIdOf = new Map(body.itemIds.map((id, index) => [id, copyIds[index]]));
  return itemIds.flatMap((id) => {
    const copyId = copyIdOf.get(id);
    return copyId === undefined ? [] : [copyId];
  });
}

function withIds(body: DriveChange, itemIds: readonly string[]): DriveChange {
  if (!('itemIds' in body)) throw new Error(`${body.action} changes carry no item list`);
  if (body.action !== 'copy') return { ...body, itemIds };
  const copyIds = copyIdsFor(body, itemIds);
  return copyIds === undefined ? { ...body, itemIds } : { ...body, itemIds, copyIds };
}

export async function changeDriveBatched(
  body: DriveChange,
  change: DriveChanger = changeDrive,
): Promise<DriveChangeResult> {
  if (!('itemIds' in body)) return change(body);
  const { result, outcome } = await changeDriveInBatches(
    {
      label: `drive.${body.action}`,
      verb: VERBS[body.action],
      ids: body.itemIds,
      body: (batch) => withIds(body, batch),
    },
    change,
  );
  const reason = outcome.reason;
  if (reason === null) return result;
  const answered = new Set(result.failed.map((failure) => failure.itemId));
  const unsent = outcome.kept.filter((id) => !answered.has(id));
  return { ...result, failed: [...result.failed, ...unsent.map((itemId) => ({ itemId, reason }))] };
}
