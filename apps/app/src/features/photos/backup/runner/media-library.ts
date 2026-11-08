import type * as MediaLibraryModule from 'expo-media-library';
import type { AssetMetadata, Query } from 'expo-media-library';
import { Logger, background } from '@smarteverything/logging';
import type { MediaAccess, MediaKind, MediaRow, MediaScope } from '../model/types';
import type { MediaLibraryPort } from './ports';

const log = new Logger('app.photos');

export const MEDIA_PAGE_ROWS = 500;

const PERMISSION_KINDS: ('photo' | 'video')[] = ['photo', 'video'];

type MediaLibrary = typeof MediaLibraryModule;

let loaded: Promise<MediaLibrary> | null = null;

function library(): Promise<MediaLibrary> {
  loaded ??= import('expo-media-library');
  return loaded;
}

export function mediaScanCancelled(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function accessOf(privileges: 'all' | 'limited' | 'none' | undefined): MediaAccess {
  return privileges ?? 'none';
}

function kindOf(lib: MediaLibrary, mediaType: MediaLibraryModule.MediaType): MediaKind | null {
  if (mediaType === lib.MediaType.IMAGE) return 'photo';
  if (mediaType === lib.MediaType.VIDEO) return 'video';
  return null;
}

function mediaTypes(lib: MediaLibrary, scope: MediaScope): Query {
  const kinds = scope.includeVideos
    ? [lib.MediaType.IMAGE, lib.MediaType.VIDEO]
    : [lib.MediaType.IMAGE];
  return new lib.Query().within(lib.AssetField.MEDIA_TYPE, kinds);
}

function rowsOf(lib: MediaLibrary, metadata: readonly AssetMetadata[]): readonly MediaRow[] {
  return metadata.flatMap((entry) => {
    const kind = kindOf(lib, entry.mediaType);
    if (kind === null || entry.filename === null) return [];
    return [
      {
        id: entry.id,
        filename: entry.filename,
        kind,
        creationTime: entry.creationTime,
        modificationTime: entry.modificationTime ?? 0,
      },
    ];
  });
}

interface PageRequest {
  readonly album: string | null;
  readonly modifiedFrom: number;
  readonly signal: AbortSignal | undefined;
}

async function* pages(
  lib: MediaLibrary,
  scope: MediaScope,
  request: PageRequest,
): AsyncGenerator<readonly MediaRow[]> {
  const { album, modifiedFrom, signal } = request;
  for (let offset = 0; ; offset += MEDIA_PAGE_ROWS) {
    if (mediaScanCancelled(signal)) return;
    let query = mediaTypes(lib, scope)
      .gte(lib.AssetField.MODIFICATION_TIME, modifiedFrom)
      .orderBy(lib.AssetField.MODIFICATION_TIME)
      .limit(MEDIA_PAGE_ROWS)
      .offset(offset);
    if (album !== null) query = query.album(new lib.Album(album));
    const metadata = await query.exeForMetadata();
    if (mediaScanCancelled(signal)) return;
    yield rowsOf(lib, metadata);
    if (metadata.length < MEDIA_PAGE_ROWS) return;
  }
}

async function* scopedPages(
  scope: MediaScope,
  modifiedFrom: number,
  signal?: AbortSignal,
): AsyncGenerator<readonly MediaRow[]> {
  if (mediaScanCancelled(signal)) return;
  const lib = await library();
  yield* pages(lib, scope, { album: null, modifiedFrom, signal });
}

export const mediaLibraryPort: MediaLibraryPort = {
  async access(): Promise<MediaAccess> {
    const lib = await library();
    return accessOf((await lib.getPermissionsAsync(false, PERMISSION_KINDS)).accessPrivileges);
  },
  async requestAccess(): Promise<MediaAccess> {
    const lib = await library();
    return accessOf((await lib.requestPermissionsAsync(false, PERMISSION_KINDS)).accessPrivileges);
  },
  async presentPicker(): Promise<void> {
    await (await library()).presentPermissionsPicker();
  },
  async listIds(scope, signal): Promise<ReadonlySet<string>> {
    const lib = await library();
    const albums = scope.albumIds.length === 0 ? [null] : scope.albumIds;
    const ids = new Set<string>();
    for (const album of albums) {
      if (mediaScanCancelled(signal)) return ids;
      for await (const rows of pages(lib, scope, { album, modifiedFrom: 0, signal })) {
        for (const row of rows) ids.add(row.id);
      }
    }
    return ids;
  },
  pagesFrom: scopedPages,
  onChange(listener): () => void {
    let subscription: { remove(): void } | null = null;
    let removed = false;
    background(
      library().then((lib) => {
        if (removed) return;
        subscription = lib.addListener(() => {
          listener();
        });
      }),
      'backup.listener_failed',
    );
    return (): void => {
      removed = true;
      subscription?.remove();
    };
  },
  async remove(localIds): Promise<boolean> {
    const lib = await library();
    try {
      await lib.Asset.delete(localIds.map((id) => new lib.Asset(id)));
      return true;
    } catch (cause) {
      log.info('backup.delete_declined', {
        reason: cause instanceof Error ? cause.message : String(cause),
      });
      return false;
    }
  },
};
