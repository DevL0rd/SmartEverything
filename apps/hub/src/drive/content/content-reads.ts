import {
  type DriveItem,
  type DriveItemText,
  type DriveZipEntryLink,
  type DriveZipPage,
  type MediaLink,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { Store } from '../../store/store';
import type { DriveActor } from '../access';
import { resolveInRoot } from '../paths';
import { decodeCursor, encodeCursor } from '../search';
import { DRIVE_PAGE_SIZE } from '../page-size';
import { zipFailure } from './zip-entry-route';
import { listZip, locateZipEntry } from './zip-index';

const ZIP_CURSOR = z.strictObject({ index: z.int().nonnegative() });

export interface ZipEntryLinks {
  readonly driveZipEntry: (itemId: string, index: number, rev: number) => MediaLink;
  readonly driveZipEntryDownload: (itemId: string, index: number, rev: number) => MediaLink;
}

export interface DriveContentDeps {
  readonly store: Pick<Store, 'host'>;
  readonly links: ZipEntryLinks;
}

export type FileItem = Exclude<DriveItem, { readonly kind: 'folder' }>;

export interface Archive {
  readonly item: FileItem;
  readonly rootPath: string;
  readonly mayExport: boolean;
}

async function archiveOf(
  deps: DriveContentDeps,
  actor: DriveActor,
  itemId: string,
): Promise<Archive> {
  return deps.store.host.read('driveArchive', { actor, itemId });
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
  const archive = await archiveOf(deps, actor, itemId);
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
  const archive = await archiveOf(deps, actor, itemId);
  await locateZipEntry(await diskPathOf(archive), index).catch(zipFailure);
  const { item } = archive;
  return {
    index,
    file: deps.links.driveZipEntry(item.id, index, item.rev),
    download: archive.mayExport ? deps.links.driveZipEntryDownload(item.id, index, item.rev) : null,
  };
}

export function itemText(
  deps: DriveContentDeps,
  actor: DriveActor,
  itemId: string,
): Promise<DriveItemText> {
  return deps.store.host.read('driveItemText', { actor, itemId });
}
