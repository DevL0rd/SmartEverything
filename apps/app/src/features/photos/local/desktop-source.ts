import type { DesktopPhotoItem } from '@smarteverything/domain';
import { desktopBridge } from '../../../design/platform';
import { desktopMediaShape, type LocalMediaShape } from './desktop-metadata';
import { localLibrary } from './store';
import type { LocalMediaItem, LocalMediaSource } from './types';

const inventory = new Map<string, DesktopPhotoItem>();
const measured = new Map<string, { readonly revision: string; readonly shape: LocalMediaShape }>();
const pending = new Map<string, Promise<string>>();
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
    width: shape?.width ?? null,
    height: shape?.height ?? null,
    durationMs: shape?.durationMs ?? null,
  };
}

async function list(signal?: AbortSignal): Promise<readonly LocalMediaItem[]> {
  const photos = desktopBridge()?.photos;
  if (photos === undefined) throw new Error('Update the desktop app to browse local photos.');
  const result = await photos.list();
  if (signal?.aborted === true) return [];
  inventory.clear();
  for (const item of result.items) inventory.set(item.id, item);
  for (const id of measured.keys()) {
    if (!inventory.has(id)) measured.delete(id);
  }
  issues = result.issues.map((issue) => `${issue.folder}: ${issue.message}`);
  return result.items.map(itemOf);
}

async function measure(item: DesktopPhotoItem): Promise<string> {
  const shape = await desktopMediaShape(item.uri, item.video);
  const revision = revisionOf(item);
  const current = inventory.get(item.id);
  if (current !== undefined && revisionOf(current) === revision) {
    measured.set(item.id, { revision, shape });
    localLibrary.update((state) => ({
      ...state,
      items: state.items.map((entry) => (entry.id === item.id ? { ...entry, ...shape } : entry)),
    }));
  }
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

export const desktopSource: LocalMediaSource = {
  access: () => Promise.resolve('all'),
  requestAccess: () => Promise.resolve('all'),
  list,
  resolve,
  issues: () => issues,
  onChange: (listener) => desktopBridge()?.photos?.onChange(listener) ?? ((): void => undefined),
};
