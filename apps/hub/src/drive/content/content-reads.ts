import {
  ApiError,
  type DriveItem,
  type DriveItemText,
  type DriveZipEntryLink,
  type DriveZipPage,
  type MediaLink,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { StoreContext } from '../../store/context';
import type { Store } from '../../store/store';
import { inLockedFolder, itemAccess, mayExport, type DriveActor } from '../access';
import { isFileItem } from '../file-item';
import { resolveInRoot } from '../paths';
import { decodeCursor, encodeCursor } from '../search';
import { DRIVE_PAGE_SIZE, type DriveReadService } from '../service-read';
import { readIndexedText } from './text-read';
import { isZipItem, zipFailure } from './zip-entry-route';
import { listZip, locateZipEntry } from './zip-index';

const ZIP_CURSOR = z.strictObject({ index: z.int().nonnegative() });

export interface ZipEntryLinks {
  readonly driveZipEntry: (itemId: string, index: number, rev: number) => MediaLink;
  readonly driveZipEntryDownload: (itemId: string, index: number, rev: number) => MediaLink;
}

export interface DriveContentDeps {
  readonly store: Pick<Store, 'driveRoots' | 'driveItems' | 'driveGrants' | 'driveItemText'>;
  readonly context: Pick<StoreContext, 'sql'>;
  readonly read: Pick<DriveReadService, 'readItem' | 'rootOfItem'>;
  readonly links: ZipEntryLinks;
}

type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;

interface Archive {
  readonly item: FileItem;
  readonly rootPath: string;
  readonly mayExport: boolean;
}

function archiveOf(deps: DriveContentDeps, actor: DriveActor, itemId: string): Archive {
  const item = deps.read.readItem(actor, itemId);
  if (inLockedFolder(item)) {
    throw new ApiError('not_found', 'There is no such file for this caller.');
  }
  if (!isFileItem(item) || !isZipItem(item)) {
    throw new ApiError('invalid_request', 'This item is not a zip archive.');
  }
  const root = deps.read.rootOfItem(actor, item);
  return {
    item,
    rootPath: root.path,
    mayExport: mayExport(itemAccess(deps.store, actor, root, item), item.locked),
  };
}

async function diskPathOf(archive: Archive): Promise<string> {
  const resolved = await resolveInRoot(archive.rootPath, archive.item.relPath).catch(zipFailure);
  return resolved.absolute;
}

export async function listArchive(
  deps: DriveContentDeps,
  actor: DriveActor,
  itemId: string,
  cursor: string | undefined,
): Promise<DriveZipPage> {
  const archive = archiveOf(deps, actor, itemId);
  const after = cursor === undefined ? 0 : decodeCursor(ZIP_CURSOR, cursor).index;
  const listing = await listZip(await diskPathOf(archive), after, DRIVE_PAGE_SIZE).catch(
    zipFailure,
  );
  return {
    items: listing.items,
    next: listing.next === null ? null : encodeCursor({ index: listing.next }),
    totals: listing.totals,
  };
}

export async function archiveEntryLink(
  deps: DriveContentDeps,
  actor: DriveActor,
  itemId: string,
  index: number,
): Promise<DriveZipEntryLink> {
  const archive = archiveOf(deps, actor, itemId);
  await locateZipEntry(await diskPathOf(archive), index).catch(zipFailure);
  const { item } = archive;
  return {
    index,
    file: deps.links.driveZipEntry(item.id, index, item.rev),
    download: archive.mayExport ? deps.links.driveZipEntryDownload(item.id, index, item.rev) : null,
  };
}

export function itemText(deps: DriveContentDeps, actor: DriveActor, itemId: string): DriveItemText {
  const item = deps.read.readItem(actor, itemId);
  if (inLockedFolder(item)) {
    throw new ApiError('not_found', 'There is no such file for this caller.');
  }
  if (item.kind === 'folder') {
    throw new ApiError('invalid_request', 'A folder holds no text of its own.');
  }
  const root = deps.read.rootOfItem(actor, item);
  if (!mayExport(itemAccess(deps.store, actor, root, item), item.locked)) {
    throw new ApiError('forbidden', 'This file is view only, so its text cannot be read out.');
  }
  const row = deps.store.driveItemText.find(item.id);
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
    text: row.state === 'ok' ? readIndexedText(deps.context, item.id) : null,
  };
}
