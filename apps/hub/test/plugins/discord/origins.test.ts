import { describe, expect, it } from 'vitest';
import { OriginStore } from '../../../src/plugins/builtin/discord/origins';
import { CHANNEL, MemoryRecords, nothing, originOf } from './fakes';

function storeOf(capacity: number): { store: OriginStore; records: MemoryRecords } {
  const records = new MemoryRecords();
  return { store: new OriginStore(records, { warn: nothing }, capacity), records };
}

describe('origin store', () => {
  it('keeps the newest origins and lets the oldest die off one at a time at capacity', () => {
    const { store, records } = storeOf(20);
    for (let index = 1; index <= 45; index += 1) {
      store.capture(originOf(index));
      expect(records.rows.size).toBe(Math.min(index, 20));
    }
    expect(store.get(originOf(25).id)).toBeUndefined();
    expect(store.get(originOf(26).id)?.text).toBe('message 26');
    expect(store.get(originOf(45).id)?.text).toBe('message 45');
    expect(store.since(undefined, 100)).toHaveLength(20);
    expect(store.hasMessage(CHANNEL, originOf(25).messageId ?? '')).toBe(false);
    expect(store.hasMessage(CHANNEL, originOf(45).messageId ?? '')).toBe(true);
  });

  it('persists only what reply routing needs', () => {
    const { store, records } = storeOf(20);
    store.capture(originOf(1, { text: 'secret words', author: undefined }));
    expect(records.rows.get(originOf(1).id)).toStrictEqual({
      id: originOf(1).id,
      kind: 'message',
      actorId: originOf(1).actorId,
      channelId: CHANNEL,
      guildId: originOf(1).guildId,
      messageId: originOf(1).messageId,
      receivedAt: originOf(1).receivedAt,
    });
  });

  it('restores routing in arrival order, trims to capacity and drops unreadable rows', () => {
    const { store: first, records } = storeOf(100);
    for (let index = 1; index <= 8; index += 1) {
      first.capture(originOf(index));
    }
    records.rows.set('junk', { nonsense: true });
    const reloaded = new OriginStore(records, { warn: nothing }, 5);
    reloaded.load();
    expect(reloaded.get(originOf(1).id)).toBeUndefined();
    expect(reloaded.since(undefined, 100).map((origin) => origin.id)).toStrictEqual(
      [4, 5, 6, 7, 8].map((index) => originOf(index).id),
    );
    expect(reloaded.get(originOf(8).id)?.text).toBe('');
    expect(records.rows.has('junk')).toBe(false);
    expect(records.rows.size).toBe(5);
  });

  it('follows an edit to the stored text', () => {
    const { store } = storeOf(20);
    store.capture(originOf(1));
    store.edit(originOf(1).messageId ?? '', CHANNEL, 'edited');
    expect(store.get(originOf(1).id)?.text).toBe('edited');
  });
});
