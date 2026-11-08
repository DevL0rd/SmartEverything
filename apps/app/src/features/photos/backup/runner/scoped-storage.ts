import type { LedgerStorage } from './ports';
import { PAUSED_STORAGE_KEY } from './ledger-store';

export function scopedBackupStorage(
  storage: LedgerStorage,
  scopeKey: string,
  current: () => boolean,
): LedgerStorage {
  const keyOf = (key: string): string => `${key}:${scopeKey}`;
  return {
    getItem: (key) => storage.getItem(keyOf(key)),
    async setItem(key, value): Promise<void> {
      if (key === PAUSED_STORAGE_KEY || current()) await storage.setItem(keyOf(key), value);
    },
  };
}
