import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { LibraryPage } from '@smarteverything/domain';
import { PHOTO_ALL, photoKeys } from '../data/keys';
import { trashFromViewer } from './actions';

vi.mock('../../../api/drive', () => ({ changeDrive: vi.fn(), createDriveShare: vi.fn() }));
vi.mock('../../../api/photos', () => ({ makeStackCover: vi.fn() }));

const A = '00000000-0000-4000-8000-0000000000a1';
const B = '00000000-0000-4000-8000-0000000000b1';

function page(ids: readonly string[]): InfiniteData<LibraryPage, string | null> {
  return {
    pages: [
      {
        month: '2026-11',
        ids,
        revs: ids.map(() => 1),
        aspect: ids.map(() => 1),
        takenAt: ids.map(() => 0),
        offsetMin: ids.map(() => null),
        durationMs: ids.map(() => null),
        flags: ids.map(() => 0),
        next: null,
      },
    ],
    pageParams: [null],
  };
}

function idsOf(client: QueryClient): readonly string[] {
  const data = client.getQueryData<InfiniteData<LibraryPage, string | null>>(
    photoKeys.month('2026-11', PHOTO_ALL),
  );
  return data === undefined ? [] : data.pages.flatMap((entry) => entry.ids);
}

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(photoKeys.month('2026-11', PHOTO_ALL), page([A, B]));
  return client;
}

describe('deleting the open photo', () => {
  it('goes through the bulk trash with only this photo and drops it from the cached views', async () => {
    const client = seeded();
    const trash = vi.fn((ids: readonly string[], landed: (ids: readonly string[]) => void) => {
      landed(ids);
      return Promise.resolve(true);
    });
    await expect(trashFromViewer(A, client, trash)).resolves.toBe(true);
    expect(trash).toHaveBeenCalledTimes(1);
    expect(trash.mock.calls[0]?.[0]).toEqual([A]);
    expect(idsOf(client)).toEqual([B]);
  });

  it('keeps the photo in the views when the hub refused it', async () => {
    const client = seeded();
    const trash = vi.fn(() => Promise.resolve(false));
    await expect(trashFromViewer(A, client, trash)).resolves.toBe(false);
    expect(idsOf(client)).toEqual([A, B]);
  });
});
