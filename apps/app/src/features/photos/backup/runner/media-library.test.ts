import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaType, type AssetMetadata } from 'expo-media-library';
import { deferred } from './deferred-fixture';
import { nativeSource } from '../../local/native-source';
import { mediaLibraryPort, MEDIA_PAGE_ROWS } from './media-library';

const source = vi.hoisted(() => ({ read: vi.fn<() => Promise<readonly AssetMetadata[]>>() }));

vi.mock('expo-media-library', () => ({
  MediaType: { IMAGE: 'image', VIDEO: 'video' },
  AssetField: { MEDIA_TYPE: 'mediaType', MODIFICATION_TIME: 'modificationTime' },
  Album: class Album {
    readonly id: string;
    constructor(id: string) {
      this.id = id;
    }
  },
  Query: class Query {
    within(): this {
      return this;
    }
    gte(): this {
      return this;
    }
    orderBy(): this {
      return this;
    }
    limit(): this {
      return this;
    }
    offset(): this {
      return this;
    }
    album(): this {
      return this;
    }
    exeForMetadata(): Promise<readonly AssetMetadata[]> {
      return source.read();
    }
  },
}));

const SCOPE = { albumIds: ['camera', 'screenshots'], includeVideos: true };

function fullPage(): readonly AssetMetadata[] {
  return Array.from({ length: MEDIA_PAGE_ROWS }, (_, index) => ({
    id: `photo-${String(index)}`,
    filename: `photo-${String(index)}.jpg`,
    mediaType: MediaType.IMAGE,
    width: 640,
    height: 480,
    duration: null,
    creationTime: 1000,
    modificationTime: 1000,
    isFavorite: false,
  }));
}

beforeEach(() => {
  source.read.mockReset();
});

describe('media enumeration cancellation', () => {
  it('stops listIds after its in-flight page without walking later pages or albums', async () => {
    const entered = deferred<null>();
    const page = deferred<readonly AssetMetadata[]>();
    source.read.mockImplementation(() => {
      entered.resolve(null);
      return page.promise;
    });
    const controller = new AbortController();
    const ids = mediaLibraryPort.listIds(SCOPE, controller.signal);
    await entered.promise;
    controller.abort();
    page.resolve(fullPage());
    expect(await ids).toEqual(new Set());
    expect(source.read).toHaveBeenCalledOnce();
  });

  it('stops pagesFrom before asking for the next Expo page', async () => {
    source.read.mockResolvedValue(fullPage());
    const controller = new AbortController();
    const rows: string[] = [];
    for await (const page of mediaLibraryPort.pagesFrom(SCOPE, 0, controller.signal)) {
      rows.push(...page.map((row) => row.id));
      controller.abort();
    }
    expect(rows).toHaveLength(MEDIA_PAGE_ROWS);
    expect(source.read).toHaveBeenCalledOnce();
  });

  it('stops a disposed local library enumeration after the current page', async () => {
    const entered = deferred<null>();
    const page = deferred<readonly AssetMetadata[]>();
    source.read.mockImplementation(() => {
      entered.resolve(null);
      return page.promise;
    });
    const controller = new AbortController();
    const items = nativeSource.list(controller.signal);
    await entered.promise;
    controller.abort();
    page.resolve(fullPage());
    expect(await items).toEqual([]);
    expect(source.read).toHaveBeenCalledOnce();
  });

  it('still walks every page normally when not cancelled', async () => {
    source.read.mockResolvedValueOnce(fullPage()).mockResolvedValueOnce([]);
    const ids = await mediaLibraryPort.listIds({ ...SCOPE, albumIds: [] });
    expect(ids.size).toBe(MEDIA_PAGE_ROWS);
    expect(source.read).toHaveBeenCalledTimes(2);
  });
});
