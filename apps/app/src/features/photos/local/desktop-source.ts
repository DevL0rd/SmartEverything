import type { DesktopPhotoItem } from '@smarteverything/domain';
import { desktopBridge } from '../../../design/platform';
import { desktopFrame } from './desktop-frame';
import { desktopMediaShape, type LocalMediaShape } from './desktop-metadata';
import { computerDeviceFolderOf } from './folders';
import { localLibrary } from './store';
import type { LocalMediaItem, LocalMediaSource } from './types';

const inventory = new Map<string, DesktopPhotoItem>();
const measured = new Map<string, { readonly revision: string; readonly shape: LocalMediaShape }>();
const pending = new Map<string, Promise<string>>();
const thumbs = new Map<string, { readonly key: string; readonly url: Promise<string> }>();
const shaped = new Map<string, LocalMediaShape>();
let frame: number | null = null;
let issues: readonly string[] = [];

function revisionOf(item: DesktopPhotoItem): string {
  return `${String(item.modifiedAt)}:${String(item.bytes)}`;
}

function itemOf(item: DesktopPhotoItem): LocalMediaItem {
  const cached = measured.get(item.id);
  const shape = cached?.revision === revisionOf(item) ? cached.shape : null;
  return {
    id: item.id,
    name: item.name,
    takenAt: item.takenAt,
    modificationTime: item.modifiedAt,
    video: item.video,
    folder: computerDeviceFolderOf(item.folder),
    width: shape?.width ?? null,
    height: shape?.height ?? null,
    durationMs: shape?.durationMs ?? null,
  };
}

function prune(): void {
  for (const id of measured.keys()) {
    if (!inventory.has(id)) measured.delete(id);
  }
  for (const [id, thumb] of thumbs) {
    const item = inventory.get(id);
    if (item === undefined || !thumb.key.startsWith(`${revisionOf(item)}:`)) dropThumb(id);
  }
}

async function list(signal?: AbortSignal): Promise<readonly LocalMediaItem[]> {
  const photos = desktopBridge()?.photos;
  if (photos === undefined) throw new Error('Update the desktop app to browse local photos.');
  const result = await photos.list();
  if (signal?.aborted === true) return [];
  inventory.clear();
  for (const item of result.items) inventory.set(item.id, item);
  prune();
  issues = result.issues.map((issue) => `${issue.folder}: ${issue.message}`);
  return result.items.map(itemOf);
}

function flushShapes(): void {
  frame = null;
  const batch = new Map(shaped);
  shaped.clear();
  localLibrary.update((state) => ({
    ...state,
    items: state.items.map((entry) => {
      const shape = batch.get(entry.id);
      return shape === undefined ? entry : { ...entry, ...shape };
    }),
  }));
}

function record(item: DesktopPhotoItem, shape: LocalMediaShape): void {
  const revision = revisionOf(item);
  const current = inventory.get(item.id);
  if (current === undefined || revisionOf(current) !== revision) return;
  if (measured.get(item.id)?.revision === revision) return;
  measured.set(item.id, { revision, shape });
  shaped.set(item.id, shape);
  frame ??= requestAnimationFrame(flushShapes);
}

async function measure(item: DesktopPhotoItem): Promise<string> {
  record(item, await desktopMediaShape(item.uri, item.video));
  return item.uri;
}

function resolve(id: string): Promise<string | null> {
  const item = inventory.get(id);
  if (item === undefined) return Promise.resolve(null);
  if (measured.get(id)?.revision === revisionOf(item)) return Promise.resolve(item.uri);
  const key = `${id}:${revisionOf(item)}`;
  const existing = pending.get(key);
  if (existing !== undefined) return existing;
  const read = measure(item).finally(() => {
    pending.delete(key);
  });
  pending.set(key, read);
  return read;
}

function dropThumb(id: string): void {
  const thumb = thumbs.get(id);
  if (thumb === undefined) return;
  thumbs.delete(id);
  thumb.url.then(
    (url) => {
      URL.revokeObjectURL(url);
    },
    () => undefined,
  );
}

async function thumbOf(item: DesktopPhotoItem, px: number): Promise<string> {
  const made = await desktopFrame(item.uri, item.video, px);
  record(item, made.shape);
  return made.url;
}

export function desktopThumbnail(id: string, px: number): Promise<string | null> {
  const item = inventory.get(id);
  if (item === undefined) return Promise.resolve(null);
  const key = `${revisionOf(item)}:${String(px)}`;
  const cached = thumbs.get(id);
  if (cached?.key === key) return cached.url;
  dropThumb(id);
  const url: Promise<string> = thumbOf(item, px).catch((error: unknown) => {
    if (thumbs.get(id)?.url === url) thumbs.delete(id);
    throw error;
  });
  thumbs.set(id, { key, url });
  return url;
}

export const desktopSource: LocalMediaSource = {
  access: () => Promise.resolve('all'),
  requestAccess: () => Promise.resolve('all'),
  list,
  resolve,
  issues: () => issues,
  onChange: (listener) => desktopBridge()?.photos?.onChange(listener) ?? ((): void => undefined),
};
