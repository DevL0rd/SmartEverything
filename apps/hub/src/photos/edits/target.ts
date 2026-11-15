import { posix } from 'node:path';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import { locate, versionRelPath, type DriveWriteRoot } from '../../drive/intents';
import { canWrite, itemAccess } from '../../drive/access';
import { writableItemRoot, type DriveCaller } from '../../drive/service-write-support';
import type { StoredDrive } from '../../store/repositories/drive-roots';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { PhotoEditRow } from '../../store/repositories/photo-edits';
import type { EditDeps } from './deps';
import type { OutputFormat } from './render';

export type ImageItem = Extract<DriveItem, { readonly kind: 'image' }>;

export type VideoItem = Extract<DriveItem, { readonly kind: 'video' }>;

export interface EditTarget<Item extends DriveItem> {
  readonly caller: DriveCaller;
  readonly item: Item;
  readonly root: StoredDrive;
}

const SAVES_IN_PLACE: Readonly<Record<string, OutputFormat>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface Capability {
  readonly canSaveVersion: boolean;
  readonly copyOnlyReason: string | null;
}

export function copyFormat(item: ImageItem): OutputFormat {
  return SAVES_IN_PLACE[item.mime] ?? 'jpeg';
}

export function capabilityOf(deps: EditDeps, target: EditTarget<ImageItem>): Capability {
  const { item, root } = target;
  const media = new DriveMediaRepository(deps.store.context).find(item.id);
  const reason =
    SAVES_IN_PLACE[item.mime] === undefined
      ? `${item.mime} photos are saved as a JPEG copy; the original stays as it is.`
      : media?.motion_clip_id !== null && media?.motion_clip_id !== undefined
        ? 'Motion photos are saved as a copy so the motion stays with the original.'
        : !root.versions
          ? 'This drive keeps no earlier versions, so the edit is saved as a copy.'
          : null;
  return { canSaveVersion: reason === null, copyOnlyReason: reason };
}

export function readableImage(deps: EditDeps, caller: DriveCaller, itemId: string): ImageItem {
  const item = deps.read.readItem(caller, itemId);
  if (item.kind !== 'image')
    throw new ApiError('invalid_request', 'Only photos can be edited here.');
  return item;
}

export function canEditItem(deps: EditDeps, caller: DriveCaller, item: ImageItem): boolean {
  const drive = deps.store.driveRoots.byId(item.rootId);
  return canWrite(itemAccess(deps.store, caller, drive, item));
}

export function imageTarget(
  deps: EditDeps,
  caller: DriveCaller,
  itemId: string,
): EditTarget<ImageItem> {
  const item = readableImage(deps, caller, itemId);
  return { caller, item, root: writableItemRoot(deps.store, caller, item) };
}

export function videoTarget(
  deps: EditDeps,
  caller: DriveCaller,
  itemId: string,
): EditTarget<VideoItem> {
  const item = deps.read.readItem(caller, itemId);
  if (item.kind !== 'video')
    throw new ApiError('invalid_request', 'Only videos can be trimmed here.');
  return { caller, item, root: writableItemRoot(deps.store, caller, item) };
}

export interface Original {
  readonly path: string;
  readonly baseVersionId: string | null;
}

export async function originalOf(
  deps: EditDeps,
  target: EditTarget<DriveItem>,
  edit: PhotoEditRow | undefined,
): Promise<Original> {
  const root: DriveWriteRoot = target.root;
  const baseId = edit?.baseVersionId ?? null;
  const base = baseId === null ? undefined : deps.store.driveVersions.find(baseId);
  if (base?.rootId === root.id && base.version.itemId === target.item.id) {
    return {
      path: await locate(root, versionRelPath(base.version.sha256)),
      baseVersionId: base.version.id,
    };
  }
  return { path: await locate(root, target.item.relPath), baseVersionId: null };
}

export interface LiveEdit {
  readonly row: PhotoEditRow | undefined;
  readonly stale: boolean;
}

export function editOf(deps: EditDeps, target: EditTarget<ImageItem>): LiveEdit {
  const row = deps.store.photoEdits.find(target.item.id, target.caller.profileId);
  if (row === undefined) return { row: undefined, stale: false };
  return row.resultSha256 === target.item.sha256
    ? { row, stale: false }
    : { row: undefined, stale: true };
}

export function stemOf(name: string): { readonly stem: string; readonly extension: string } {
  const extension = posix.extname(name);
  return { stem: name.slice(0, name.length - extension.length), extension };
}
