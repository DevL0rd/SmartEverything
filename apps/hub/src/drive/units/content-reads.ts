import { ApiError, type DriveItemText } from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import { inLockedFolder, itemAccess, mayExport, type DriveActor } from '../access';
import type { Archive } from '../content/content-reads';
import { readIndexedText } from '../content/text-read';
import { isZipItem } from '../content/zip-item';
import { isFileItem } from '../file-item';
import { DriveReadRules } from './read';

export interface ItemInput {
  readonly actor: DriveActor;
  readonly itemId: string;
}

export const DRIVE_ARCHIVE_UNIT = storeUnit((store, { actor, itemId }: ItemInput): Archive => {
  const read = new DriveReadRules(store);
  const item = read.readItem(actor, itemId);
  if (inLockedFolder(item)) {
    throw new ApiError('not_found', 'There is no such file for this caller.');
  }
  if (!isFileItem(item) || !isZipItem(item)) {
    throw new ApiError('invalid_request', 'This item is not a zip archive.');
  }
  const root = read.rootOfItem(actor, item);
  return {
    item,
    rootPath: root.path,
    mayExport: mayExport(itemAccess(store, actor, root, item), item.locked),
  };
});

export const DRIVE_ITEM_TEXT_UNIT = storeUnit(
  (store, { actor, itemId }: ItemInput): DriveItemText => {
    const read = new DriveReadRules(store);
    const item = read.readItem(actor, itemId);
    if (inLockedFolder(item)) {
      throw new ApiError('not_found', 'There is no such file for this caller.');
    }
    if (item.kind === 'folder') {
      throw new ApiError('invalid_request', 'A folder holds no text of its own.');
    }
    const root = read.rootOfItem(actor, item);
    if (!mayExport(itemAccess(store, actor, root, item), item.locked)) {
      throw new ApiError('forbidden', 'This file is view only, so its text cannot be read out.');
    }
    const row = store.driveItemText.find(item.id);
    if (row?.rev !== item.rev) {
      return {
        itemId: item.id,
        rev: item.rev,
        source: null,
        state: 'pending',
        reason: null,
        chars: 0,
        text: null,
      };
    }
    return {
      itemId: item.id,
      rev: row.rev,
      source: row.source,
      state: row.state,
      reason: row.reason,
      chars: row.chars,
      text: row.state === 'ok' ? readIndexedText(store.context, item.id) : null,
    };
  },
);
