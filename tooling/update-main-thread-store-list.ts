import { writeFileSync } from 'node:fs';
import {
  MAIN_THREAD_STORE_LIST,
  mainThreadStoreUses,
  readMainThreadStore,
} from './guards/main-thread-store.ts';

const listed = readMainThreadStore();
const remaining = mainThreadStoreUses(new Set(listed.hosted));
const grown = Object.entries(remaining)
  .filter(([path, uses]) => uses > (listed.remaining[path] ?? 0))
  .map(([path, uses]) => `${path}: ${String(listed.remaining[path] ?? 0)} -> ${String(uses)}`);
if (grown.length > 0)
  throw new Error(
    `Synchronous store use on the Hub main thread grew; move it into a store host unit instead:\n${grown.join('\n')}`,
  );
writeFileSync(MAIN_THREAD_STORE_LIST, `${JSON.stringify({ ...listed, remaining }, null, 2)}\n`);
