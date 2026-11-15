import { describe, expect, it } from 'vitest';
import { STORED_LEDGER } from '../model/ledger';
import { MemoryLedgerFile, MemoryStorage } from './fixtures';
import { LEDGER_STORAGE_KEY, loadLedger, saveLedger } from './ledger-store';
import type { LedgerStorage } from './ports';

const ENTRY = {
  localId: 'a',
  sha256: 'ab'.repeat(32),
  bytes: 12,
  modificationTime: 1000,
  uploadedAt: '2026-11-06T10:00:00.000Z',
};

const ITEM = '11111111-1111-4111-8111-111111111111';

function stores(): { storage: MemoryStorage; ledgerFile: MemoryLedgerFile } {
  return { storage: new MemoryStorage(), ledgerFile: new MemoryLedgerFile() };
}

describe('stored backup ledger migration', () => {
  it('moves a version one ledger into the file once and deletes the old key', async () => {
    const s = stores();
    s.storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({ version: 1, lastSeen: 5000, entries: [ENTRY] }),
    );
    const ledger = await loadLedger(s);
    expect(ledger.lastSeen).toBe(5000);
    expect(ledger.uploaded()).toEqual([{ ...ENTRY, itemId: null }]);
    expect(s.ledgerFile.text).toBe(JSON.stringify(ledger.toStored()));
    expect(ledger.toStored().version).toBe(2);
    expect(s.storage.values.has(LEDGER_STORAGE_KEY)).toBe(false);
    const reloaded = await loadLedger(s);
    expect(reloaded.toStored()).toEqual(ledger.toStored());
  });

  it('moves a version two ledger from the old key into the file', async () => {
    const s = stores();
    const entry = { ...ENTRY, itemId: ITEM };
    s.storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({ version: 2, lastSeen: 7, entries: [entry] }),
    );
    const ledger = await loadLedger(s);
    expect(ledger.find('a')).toEqual(entry);
    expect(s.storage.values.size).toBe(0);
    expect(STORED_LEDGER.parse(JSON.parse(s.ledgerFile.text ?? ''))).toEqual(ledger.toStored());
  });

  it('reads only the file once it exists and ignores a key left in storage', async () => {
    const s = stores();
    await saveLedger(s, await loadLedger(s));
    s.storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({ version: 2, lastSeen: 9, entries: [{ ...ENTRY, itemId: ITEM }] }),
    );
    expect((await loadLedger(s)).has('a')).toBe(false);
    expect(s.storage.values.has(LEDGER_STORAGE_KEY)).toBe(true);
  });

  it('stores a ledger far beyond what one storage key holds', async () => {
    const s = stores();
    const ledger = await loadLedger(s);
    for (let at = 0; at < 60_000; at += 1) {
      ledger.put({ ...ENTRY, localId: `local-${String(at)}`, itemId: ITEM });
    }
    await saveLedger(s, ledger);
    expect((s.ledgerFile.text ?? '').length).toBeGreaterThan(8 * 1024 * 1024);
    expect((await loadLedger(s)).localIds().size).toBe(60_000);
  });

  it('uses strict version two identities and rejects a malformed legacy record', async () => {
    expect(STORED_LEDGER.safeParse({ version: 2, lastSeen: 0, entries: [ENTRY] }).success).toBe(
      false,
    );
    const s = stores();
    s.storage.values.set(
      LEDGER_STORAGE_KEY,
      JSON.stringify({ version: 1, lastSeen: 5000, entries: [{ ...ENTRY, unknown: true }] }),
    );
    expect((await loadLedger(s)).uploaded()).toEqual([]);
    expect(s.storage.values.has(LEDGER_STORAGE_KEY)).toBe(false);
  });

  it('starts empty and still clears an old key the storage cannot read', async () => {
    const removed: string[] = [];
    const broken: LedgerStorage = {
      getItem: () => Promise.reject(new Error('Row too big to fit into CursorWindow')),
      setItem: () => Promise.resolve(),
      removeItem: (key) => {
        removed.push(key);
        return Promise.resolve();
      },
    };
    const ledgerFile = new MemoryLedgerFile();
    expect((await loadLedger({ storage: broken, ledgerFile })).localIds().size).toBe(0);
    expect(removed).toEqual([LEDGER_STORAGE_KEY]);
    expect(ledgerFile.text).not.toBeNull();
  });
});
