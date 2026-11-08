import { describe, expect, it } from 'vitest';
import { STORED_LEDGER } from '../model/ledger';
import { MemoryStorage } from './fixtures';
import { LEDGER_STORAGE_KEY, loadLedger } from './ledger-store';

const ENTRY = {
  localId: 'a',
  sha256: 'ab'.repeat(32),
  bytes: 12,
  modificationTime: 1000,
  uploadedAt: '2026-11-06T10:00:00.000Z',
};

describe('stored backup ledger migration', () => {
  it('persists version two once while retaining old upload knowledge and checkpoint', async () => {
    const storage = new MemoryStorage();
    storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lastSeen: 5000,
        entries: [ENTRY],
      }),
    );
    const ledger = await loadLedger(storage);
    expect(ledger.lastSeen).toBe(5000);
    expect(ledger.uploaded()).toEqual([{ ...ENTRY, itemId: null }]);
    const saved = storage.values.get(LEDGER_STORAGE_KEY);
    expect(saved).toBe(JSON.stringify(ledger.toStored()));
    expect(ledger.toStored().version).toBe(2);
    const reloaded = await loadLedger(storage);
    expect(reloaded.toStored()).toEqual(ledger.toStored());
    expect(storage.values.get(LEDGER_STORAGE_KEY)).toBe(saved);
  });

  it('uses strict version two identities and rejects a malformed legacy record', async () => {
    expect(STORED_LEDGER.safeParse({ version: 2, lastSeen: 0, entries: [ENTRY] }).success).toBe(
      false,
    );
    const storage = new MemoryStorage();
    storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        lastSeen: 5000,
        entries: [{ ...ENTRY, unknown: true }],
      }),
    );
    expect((await loadLedger(storage)).uploaded()).toEqual([]);
  });
});
