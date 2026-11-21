import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';

export const BUNDLED_STORE_HOST = fileURLToPath(new URL('./store-host.mjs', import.meta.url));

export function storeReaders(): number {
  return Math.max(1, availableParallelism() - 1);
}
