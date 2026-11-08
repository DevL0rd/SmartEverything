import { describe, expect, it, vi } from 'vitest';

interface FakeAlbum {
  readonly id: string;
  getTitle(): Promise<string>;
}

const albums = vi.hoisted((): { list: readonly FakeAlbum[] } => ({ list: [] }));

vi.mock('expo-media-library', () => ({
  Album: { getAll: (): Promise<readonly FakeAlbum[]> => Promise.resolve(albums.list) },
}));

const { listPhoneAlbums } = await import('./phone-albums');

const album = (id: string, title: string): FakeAlbum => ({
  id,
  getTitle: () => Promise.resolve(title),
});

describe('phone albums for backup', () => {
  it('lists the albums on this phone by name', async () => {
    albums.list = [album('2', 'Screenshots'), album('1', 'Camera'), album('3', 'WhatsApp Images')];
    await expect(listPhoneAlbums()).resolves.toEqual([
      { id: '1', title: 'Camera' },
      { id: '2', title: 'Screenshots' },
      { id: '3', title: 'WhatsApp Images' },
    ]);
  });

  it('rejects an album the phone reports without an id', async () => {
    albums.list = [album('', 'Broken')];
    await expect(listPhoneAlbums()).rejects.toThrow();
  });

  it('returns nothing when the phone has no albums', async () => {
    albums.list = [];
    await expect(listPhoneAlbums()).resolves.toEqual([]);
  });
});
