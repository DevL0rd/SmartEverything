import { get, set } from 'idb-keyval';
import type { LedgerFile } from './ports';

const KEY_PREFIX = 'smarteverything.photos.backup.ledger-file:';

export function ledgerFileOf(scopeKey: string): LedgerFile {
  const key = `${KEY_PREFIX}${scopeKey}`;
  return {
    async read(): Promise<string | null> {
      const value = await get<unknown>(key);
      return typeof value === 'string' ? value : null;
    },
    write: (text) => set(key, text),
  };
}
