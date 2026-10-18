import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted((): { items: Map<string, string> } => ({ items: new Map() }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    setItem: (key: string, value: string): Promise<void> => {
      disk.items.set(key, value);
      return Promise.resolve();
    },
    multiGet: (keys: readonly string[]): Promise<[string, string | null][]> =>
      Promise.resolve(
        keys.map((key): [string, string | null] => [key, disk.items.get(key) ?? null]),
      ),
    multiRemove: (keys: readonly string[]): Promise<void> => {
      keys.forEach((key) => disk.items.delete(key));
      return Promise.resolve();
    },
  },
}));

const { readStored, removeStored, writeStored } = await import('./snapshot-storage.native');

describe('native snapshot storage', () => {
  beforeEach(() => {
    disk.items.clear();
  });

  it('reads only the keys that exist, writes and removes by key', async () => {
    await writeStored('a', '1');
    await writeStored('b', '2');
    expect([...(await readStored(['a', 'b', 'c']))]).toEqual([
      ['a', '1'],
      ['b', '2'],
    ]);
    await removeStored(['a']);
    expect([...(await readStored(['a', 'b']))]).toEqual([['b', '2']]);
  });
});
