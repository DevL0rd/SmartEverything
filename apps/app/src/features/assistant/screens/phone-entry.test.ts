import { describe, expect, it } from 'vitest';
import { RECENT_CHAT_MS, chatWasRecent, phoneEntryOf } from './phone-entry';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');

describe('phone entry rule', () => {
  it('counts a chat seen less than thirty minutes ago as recent', () => {
    expect(chatWasRecent(NOW - RECENT_CHAT_MS + 1, NOW)).toBe(true);
    expect(chatWasRecent(NOW - RECENT_CHAT_MS, NOW)).toBe(false);
  });

  it('never counts a chat that was not seen', () => {
    expect(chatWasRecent(null, NOW)).toBe(false);
  });

  it('opens the last chat when it was recent and the list otherwise', () => {
    const last = { kind: 'open', chatId: 'chat-1' } as const;
    expect(phoneEntryOf(last, null, true)).toEqual({
      kind: 'chat',
      chatId: 'chat-1',
      forget: false,
    });
    expect(phoneEntryOf(last, null, false)).toEqual({ kind: 'chat', chatId: null, forget: false });
  });

  it('waits for a chat that is not synced yet and forgets one that is gone', () => {
    expect(phoneEntryOf({ kind: 'pending', chatId: 'chat-1' }, null, true)).toEqual({
      kind: 'wait',
    });
    expect(phoneEntryOf({ kind: 'gone', chatId: 'chat-1' }, 'chat-2', true)).toEqual({
      kind: 'chat',
      chatId: 'chat-2',
      forget: true,
    });
  });
});
