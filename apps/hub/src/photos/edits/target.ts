import { posix } from 'node:path';
import { ApiError, type DriveItem } from '@smarteverything/domain';
import { locate, versionRelPath, type DriveWriteRoot } from '../../drive/intents';
import { canWrite, itemAccess } from '../../drive/access';
import { writableItemRoot, type DriveCaller } from '../../drive/service-write-support';
import { storeUnit } from '../../store/host/unit';
import { DriveMediaRepository } from '../../store/repositories/drive-media';
import type { StoredDrive } from '../../store/repositories/drive-roots';
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

export interface EditFacts {
  readonly row: PhotoEditRow | undefined;
  readonly motion: boolean;
}

export function capabilityOf(target: EditTarget<ImageItem>, facts: EditFacts): Capability {
  const { item, root } = target;
  const reason =
    SAVES_IN_PLACE[item.mime] === undefined
      ? `${item.mime} photos are saved as a JPEG copy; the original stays as it is.`
      : facts.motion
        ? 'Motion photos are saved as a copy so the motion stays with the original.'
        : !root.versions
          ? 'This drive keeps no earlier versions, so the edit is saved as a copy.'
          : null;
  return { canSaveVersion: reason === null, copyOnlyReason: reason };
}

export async function readableImage(
  deps: EditDeps,
  caller: DriveCaller,
  itemId: string,
): Promise<ImageItem> {
  const item = await deps.read.readItem(caller, itemId);
  if (item.kind !== 'image')
    throw new ApiError('invalid_request', 'Only photos can be edited here.');
  return item;
}

export async function canEditItem(
  deps: EditDeps,
  caller: DriveCaller,
  item: ImageItem,
): Promise<boolean> {
  const drive = await deps.store.host.call('driveRoots', 'byId', item.rootId);
  return canWrite(itemAccess(deps.store, caller, drive, item));
}

export async function imageTarget(
  deps: EditDeps,
  caller: DriveCaller,
  itemId: string,
): Promise<EditTarget<ImageItem>> {
  const item = await readableImage(deps, caller, itemId);
  return { caller, item, root: await writableItemRoot(deps.store, caller, item) };
}

export async function videoTarget(
  deps: EditDeps,
  caller: DriveCaller,
  itemId: string,
): Promise<EditTarget<VideoItem>> {
  const item = await deps.read.readItem(caller, itemId);
  if (item.kind !== 'video')
    throw new ApiError('invalid_request', 'Only videos can be trimmed here.');
  return { caller, item, root: await writableItemRoot(deps.store, caller, item) };
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
  const base =
    baseId === null ? undefined : await deps.store.host.call('driveVersions', 'find', baseId);
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

export function editFacts(deps: EditDeps, target: EditTarget<ImageItem>): Promise<EditFacts> {
  return deps.store.host.read('photoEditFacts', {
    itemId: target.item.id,
    profileId: target.caller.profileId,
  });
}

export function liveEditOf(target: EditTarget<ImageItem>, row: PhotoEditRow | undefined): LiveEdit {
  if (row === undefined) return { row: undefined, stale: false };
  return row.resultSha256 === target.item.sha256
    ? { row, stale: false }
    : { row: undefined, stale: true };
}

export function stemOf(name: string): { readonly stem: string; readonly extension: string } {
  const extension = posix.extname(name);
  return { stem: name.slice(0, name.length - extension.length), extension };
}

export const PHOTO_EDIT_FACTS_UNIT = storeUnit(
  (store, input: { readonly itemId: string; readonly profileId: string }): EditFacts => {
    const media = new DriveMediaRepository(store.context).find(input.itemId);
    return {
      row: store.photoEdits.find(input.itemId, input.profileId),
      motion: media?.motion_clip_id !== null && media?.motion_clip_id !== undefined,
    };
  },
);
