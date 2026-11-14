import {
  DESKTOP_PHOTO_HASH,
  DESKTOP_PHOTO_LIBRARY,
  type DesktopPhotoItem,
  type DesktopPhotos,
} from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { assertUploadActive } from '../../../drive';
import type { ServerConnection } from '../../../../api/connection/storage';
import type { Conditions, MediaAccess, MediaRow, MediaScope, MediaStat } from '../model/types';
import type { BackupPorts, MediaLibraryPort, NativeMediaPort } from './ports';
import { conditionsPort } from './network-conditions';
import { createBackupUploadPort } from './native-adapters';

function rowOf(item: DesktopPhotoItem): MediaRow {
  return {
    id: item.id,
    filename: item.name,
    kind: item.video ? 'video' : 'photo',
    creationTime: item.takenAt,
    modificationTime: item.modifiedAt,
  };
}

class DesktopLibrary {
  private readonly items = new Map<string, DesktopPhotoItem>();

  constructor(private readonly photos: DesktopPhotos) {}

  async list(scope: MediaScope, signal?: AbortSignal): Promise<readonly DesktopPhotoItem[]> {
    assertUploadActive(signal);
    const library = DESKTOP_PHOTO_LIBRARY.parse(await this.photos.list());
    assertUploadActive(signal);
    if (library.issues.length > 0)
      throw new Error(
        library.issues.map((issue) => `${issue.folder}: ${issue.message}`).join('\n'),
      );
    this.items.clear();
    for (const item of library.items) this.items.set(item.id, item);
    return library.items.filter((item) => scope.includeVideos || !item.video);
  }

  readonly itemOf = (id: string): DesktopPhotoItem => {
    const item = this.items.get(id);
    if (item === undefined) throw new Error('This local photo is no longer in the library.');
    return item;
  };

  port(): MediaLibraryPort {
    return {
      access: (): Promise<MediaAccess> => Promise.resolve('all'),
      requestAccess: (): Promise<MediaAccess> => Promise.resolve('all'),
      presentPicker: (): Promise<void> =>
        Promise.reject(new Error('Desktop backup uses Pictures and Videos.')),
      listIds: async (scope, signal) =>
        new Set((await this.list(scope, signal)).map((item) => item.id)),
      pagesFrom: (scope, modifiedFrom, signal) => this.pages(scope, modifiedFrom, signal),
      onChange: (listener) => this.photos.onChange(listener),
      remove: (): Promise<boolean> =>
        Promise.reject(new Error('Desktop photo backup does not delete local originals.')),
    };
  }

  private async *pages(
    scope: MediaScope,
    modifiedFrom: number,
    signal?: AbortSignal,
  ): AsyncGenerator<readonly MediaRow[]> {
    yield (await this.list(scope, signal))
      .filter((item) => item.modifiedAt >= modifiedFrom)
      .map(rowOf);
  }
}

export function desktopBackupAdapters(
  photos: DesktopPhotos,
  connection: ServerConnection,
  key: string,
): Pick<BackupPorts, 'media' | 'native' | 'conditions' | 'upload'> {
  const library = new DesktopLibrary(photos);
  let operation = 0;
  const network = conditionsPort({
    read: () => photos.charging(),
    subscribe: (listener) => photos.onChargingChange(listener),
  });
  return {
    media: library.port(),
    native: desktopNativePort(
      photos,
      library.itemOf,
      () => `photos-desktop-${String(++operation)}`,
    ),
    conditions: {
      ...network,
      async read(): Promise<Conditions> {
        const state = await network.read();
        return { ...state, wifi: !state.metered };
      },
    },
    upload: createBackupUploadPort(connection, key, (id, offset, bytes, signal) =>
      readDesktopChunk(library.itemOf(id).uri, offset, bytes, signal),
    ),
  };
}

function desktopNativePort(
  photos: DesktopPhotos,
  itemOf: (id: string) => DesktopPhotoItem,
  nextOperation: () => string,
): NativeMediaPort {
  return {
    statMedia(ids, signal): Promise<readonly MediaStat[]> {
      assertUploadActive(signal);
      return Promise.resolve(
        ids.map((id) => {
          const item = itemOf(id);
          return {
            id,
            bytes: item.bytes,
            mimeType: item.mimeType,
            relativePath: '',
            dateAddedSeconds: Math.floor(item.takenAt / 1000),
            modifiedSeconds: Math.floor(item.modifiedAt / 1000),
            isTrashed: false,
            isPending: false,
          };
        }),
      );
    },
    async hashFile(id, signal): ReturnType<NativeMediaPort['hashFile']> {
      assertUploadActive(signal);
      const operation = nextOperation();
      const abort = (): void => {
        background(photos.cancel(operation), 'backup.hash_cancel_failed');
      };
      signal?.addEventListener('abort', abort, { once: true });
      try {
        const value = DESKTOP_PHOTO_HASH.parse(await photos.hash({ id, operation }));
        assertUploadActive(signal);
        return value;
      } finally {
        signal?.removeEventListener('abort', abort);
      }
    },
  };
}

export async function readDesktopChunk(
  uri: string,
  offset: number,
  bytes: number,
  signal: AbortSignal,
): Promise<Blob> {
  assertUploadActive(signal);
  const response = await fetch(uri, {
    headers: { Range: `bytes=${String(offset)}-${String(offset + bytes - 1)}` },
    signal,
  });
  if (response.status !== 206)
    throw new Error(
      `Local photo range read returned ${String(response.status)} instead of partial content.`,
    );
  const blob = await response.blob();
  if (blob.size !== bytes) throw new Error('Local photo changed while backup was reading it.');
  assertUploadActive(signal);
  return blob;
}
