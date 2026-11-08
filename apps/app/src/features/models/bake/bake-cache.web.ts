import { createStore, delMany, entries, get, set } from 'idb-keyval';
import {
  STORED_BAKE,
  bakeKeyHash,
  bakeKeyText,
  isSuperseded,
  parseJson,
  type BakeCache,
  type BakeKey,
  type BakedImage,
  type BakesInUse,
  type StoredBake,
} from './bake-protocol';

const store = createStore('smarteverything-model-bakes', 'bakes');

function parseStored(value: unknown): StoredBake | null {
  if (typeof value !== 'string') return null;
  const parsed = STORED_BAKE.safeParse(parseJson(value));
  return parsed.success ? parsed.data : null;
}

async function read(key: BakeKey): Promise<StoredBake | null> {
  const stored = parseStored(await get(bakeKeyHash(key), store));
  return stored?.keyText === bakeKeyText(key) ? stored : null;
}

async function write(key: BakeKey, image: BakedImage): Promise<StoredBake> {
  const stored: StoredBake = { keyText: bakeKeyText(key), key, image };
  await set(bakeKeyHash(key), JSON.stringify(stored), store);
  return stored;
}

async function prune(inUse: BakesInUse): Promise<number> {
  const all = await entries<IDBValidKey, unknown>(store);
  const removed = all
    .filter(([, value]) => {
      const stored = parseStored(value);
      return stored === null || isSuperseded(stored.key, inUse);
    })
    .map(([key]) => key);
  await delMany(removed, store);
  return removed.length;
}

export const bakeCache: BakeCache = { read, write, prune };
