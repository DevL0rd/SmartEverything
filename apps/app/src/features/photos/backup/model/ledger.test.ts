import { describe, expect, it } from 'vitest';
import { Ledger, STORED_LEDGER } from './ledger';

const ITEM_ID = 'a1b2c3d4-0000-4000-8000-0000000000aa';
const HASH = 'cd'.repeat(32);

describe('phone ledger', () => {
  it('round trips through its stored form', () => {
    const ledger = new Ledger();
    ledger.put({
      localId: 'a',
      sha256: HASH,
      bytes: 5,
      modificationTime: 10,
      uploadedAt: null,
      itemId: null,
    });
    ledger.markUploaded('a', '2026-11-07T10:00:00.000Z', ITEM_ID);
    ledger.advance(10);
    const copy = new Ledger(STORED_LEDGER.parse(JSON.parse(JSON.stringify(ledger.toStored()))));
    expect(copy.lastSeen).toBe(10);
    expect(copy.find('a')?.itemId).toBe(ITEM_ID);
    expect(copy.find('a')?.uploadedAt).toBe('2026-11-07T10:00:00.000Z');
    expect(copy.latestUpload()).toBe('2026-11-07T10:00:00.000Z');
  });

  it('only moves the last seen time forward until it is rewound', () => {
    const ledger = new Ledger();
    ledger.advance(10);
    ledger.advance(4);
    expect(ledger.lastSeen).toBe(10);
    ledger.rewind();
    expect(ledger.lastSeen).toBe(0);
  });

  it('forgets entries and lists only uploaded ones', () => {
    const ledger = new Ledger();
    ledger.put({
      localId: 'a',
      sha256: HASH,
      bytes: 5,
      modificationTime: 1,
      uploadedAt: null,
      itemId: null,
    });
    ledger.put({
      localId: 'b',
      sha256: HASH,
      bytes: 5,
      modificationTime: 1,
      uploadedAt: '2026-11-07T10:00:00.000Z',
      itemId: ITEM_ID,
    });
    expect(ledger.uploaded().map((entry) => entry.localId)).toEqual(['b']);
    ledger.forget(['b']);
    expect(ledger.has('b')).toBe(false);
    expect(ledger.latestUpload()).toBeNull();
  });

  it('refuses a stored ledger of another shape', () => {
    expect(STORED_LEDGER.safeParse({ version: 1, lastSeen: 0, entries: [] }).success).toBe(false);
  });
});
