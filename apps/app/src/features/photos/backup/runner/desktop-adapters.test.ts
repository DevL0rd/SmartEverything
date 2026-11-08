import type { DesktopPhotos, DesktopPhotoItem } from '@smarteverything/domain';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ConditionsPort, UploadPort } from './ports';
import type { ServerConnection } from '../../../../api/connection/storage';
import { desktopBackupAdapters, readDesktopChunk } from './desktop-adapters';

vi.mock('./native-adapters', () => ({
  createBackupUploadPort: vi.fn((): UploadPort => ({ start: vi.fn() })),
}));
vi.mock('./network-conditions', () => ({
  conditionsPort: (): ConditionsPort => ({
    read: () => Promise.resolve({ connected: true, metered: false, wifi: false, charging: true }),
    subscribe: () => (): void => undefined,
  }),
}));

const connection: ServerConnection = { url: 'https://fixture.test', token: 'fixture-token' };
const item: DesktopPhotoItem = {
  id: 'a'.repeat(64),
  name: 'large.mp4',
  mimeType: 'video/mp4',
  bytes: 12 * 1024 ** 3,
  modifiedAt: 2000,
  takenAt: 1000,
  uri: `app://smarteverything/local-media/${'a'.repeat(64)}`,
  video: true,
};
const list = vi.fn<DesktopPhotos['list']>();
const hash = vi.fn<DesktopPhotos['hash']>();
const cancel = vi.fn<DesktopPhotos['cancel']>();
const photos: DesktopPhotos = {
  list,
  hash,
  cancel,
  onChange: () => () => undefined,
  charging: () => Promise.resolve(true),
  onChargingChange: () => () => undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({ items: [item], issues: [] });
  cancel.mockResolvedValue();
});

it('scans large desktop originals as metadata and retains photo/video scope without reading bytes', async () => {
  const ports = desktopBackupAdapters(photos, connection, 'scope');
  expect(await ports.media.listIds({ albumIds: [], includeVideos: false })).toEqual(new Set());
  expect(await ports.media.listIds({ albumIds: [], includeVideos: true })).toEqual(
    new Set([item.id]),
  );
  expect(await ports.native.statMedia([item.id])).toMatchObject([
    { id: item.id, bytes: item.bytes },
  ]);
  const pages = [];
  for await (const page of ports.media.pagesFrom({ albumIds: [], includeVideos: true }, 0))
    pages.push(...page);
  expect(pages).toEqual([
    { id: item.id, filename: item.name, kind: 'video', creationTime: 1000, modificationTime: 2000 },
  ]);
  expect(hash).not.toHaveBeenCalled();
  expect(await ports.conditions.read()).toMatchObject({ wifi: true, metered: false });
});

it('reports folder scan failures instead of marking an incomplete inventory backed up', async () => {
  list.mockResolvedValue({ items: [], issues: [{ folder: 'Pictures', message: 'Access denied' }] });
  const ports = desktopBackupAdapters(photos, connection, 'scope');
  await expect(ports.media.listIds({ albumIds: [], includeVideos: true })).rejects.toThrow(
    'Access denied',
  );
});

it('cancels native hashing and rejects a late result when backup stops', async () => {
  const controller = new AbortController();
  let finish: (value: { sha256: string; bytes: number }) => void = () => undefined;
  hash.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const ports = desktopBackupAdapters(photos, connection, 'scope');
  const pending = ports.native.hashFile(item.id, controller.signal);
  controller.abort();
  finish({ sha256: 'b'.repeat(64), bytes: item.bytes });
  await expect(pending).rejects.toThrow();
  expect(cancel).toHaveBeenCalledWith('photos-desktop-1');
});

it('reads only the requested chunk and rejects a full-file response', async () => {
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
  try {
    fetcher.mockResolvedValue(new Response(new Blob(['chunk']), { status: 206 }));
    const signal = new AbortController().signal;
    expect((await readDesktopChunk(item.uri, 10, 5, signal)).size).toBe(5);
    expect(fetcher).toHaveBeenCalledWith(item.uri, { headers: { Range: 'bytes=10-14' }, signal });
    fetcher.mockResolvedValue(new Response('large full file', { status: 200 }));
    await expect(readDesktopChunk(item.uri, 10, 5, signal)).rejects.toThrow('partial content');
  } finally {
    vi.unstubAllGlobals();
  }
});
