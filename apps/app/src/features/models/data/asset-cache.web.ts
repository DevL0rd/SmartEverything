import { createStore, delMany, entries, get, set } from 'idb-keyval';
import type { AssetCache } from './asset-cache-protocol';

const store = createStore('smarteverything-model-assets', 'assets');

async function read(sha256: string): Promise<Uint8Array | null> {
  const value: unknown = await get(sha256, store);
  return value instanceof Uint8Array ? value : null;
}

async function write(sha256: string, bytes: Uint8Array): Promise<void> {
  await set(sha256, bytes, store);
}

async function prune(keep: ReadonlySet<string>): Promise<number> {
  const all = await entries<IDBValidKey, unknown>(store);
  const stale = all.map(([key]) => key).filter((key) => typeof key !== 'string' || !keep.has(key));
  await delMany(stale, store);
  return stale.length;
}

export const assetCache: AssetCache = { read, write, prune };
