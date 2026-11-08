import type * as MediaLibraryModule from 'expo-media-library';
import type { AssetMetadata } from 'expo-media-library';
import {
  mediaLibraryPort,
  MEDIA_PAGE_ROWS,
  mediaScanCancelled,
} from '../backup/runner/media-library';
import type { LocalMediaItem, LocalMediaSource } from './types';

type MediaLibrary = typeof MediaLibraryModule;

function dimension(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}

function itemOf(lib: MediaLibrary, entry: AssetMetadata): LocalMediaItem | null {
  const video = entry.mediaType === lib.MediaType.VIDEO;
  if (!video && entry.mediaType !== lib.MediaType.IMAGE) return null;
  return {
    id: entry.id,
    name: entry.filename ?? entry.id,
    takenAt: entry.creationTime ?? entry.modificationTime ?? 0,
    modificationTime: entry.modificationTime ?? 0,
    width: dimension(entry.width),
    height: dimension(entry.height),
    durationMs: entry.duration === null ? null : entry.duration * 1000,
    video,
  };
}

async function listLibrary(signal?: AbortSignal): Promise<readonly LocalMediaItem[]> {
  const lib = await import('expo-media-library');
  const items: LocalMediaItem[] = [];
  for (let offset = 0; ; offset += MEDIA_PAGE_ROWS) {
    if (mediaScanCancelled(signal)) return items;
    const page = await new lib.Query()
      .within(lib.AssetField.MEDIA_TYPE, [lib.MediaType.IMAGE, lib.MediaType.VIDEO])
      .orderBy(lib.AssetField.MODIFICATION_TIME)
      .limit(MEDIA_PAGE_ROWS)
      .offset(offset)
      .exeForMetadata();
    if (mediaScanCancelled(signal)) return items;
    for (const entry of page) {
      const item = itemOf(lib, entry);
      if (item !== null) items.push(item);
    }
    if (page.length < MEDIA_PAGE_ROWS) return items;
  }
}

export const nativeSource: LocalMediaSource = {
  access: () => mediaLibraryPort.access(),
  async requestAccess(): Promise<Awaited<ReturnType<LocalMediaSource['requestAccess']>>> {
    if ((await mediaLibraryPort.access()) === 'limited') {
      await mediaLibraryPort.presentPicker();
      return mediaLibraryPort.access();
    }
    return mediaLibraryPort.requestAccess();
  },
  list: listLibrary,
  issues: () => [],
  onChange: (listener) => mediaLibraryPort.onChange(listener),
  async resolve(id): Promise<string> {
    const lib = await import('expo-media-library');
    return new lib.Asset(id).getUri();
  },
};
