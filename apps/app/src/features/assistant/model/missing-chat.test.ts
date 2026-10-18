import { describe, expect, it } from 'vitest';
import { missingChatState, type MissingChatFacts } from './missing-chat';

const SETTLED: MissingChatFacts = {
  syncing: false,
  loading: false,
  failed: false,
  archivedIds: [],
};

describe('what a chat link that is not in the live store shows', () => {
  it('waits while the first sync is still running', () => {
    expect(missingChatState('a', { ...SETTLED, syncing: true })).toBe('waiting');
  });

  it('checks the archive before giving up', () => {
    expect(missingChatState('a', { ...SETTLED, loading: true })).toBe('checking');
  });

  it('reports a failed archive read instead of claiming the chat is gone', () => {
    expect(missingChatState('a', { ...SETTLED, failed: true })).toBe('failed');
  });

  it('offers to restore a chat that is archived', () => {
    expect(missingChatState('a', { ...SETTLED, archivedIds: ['b', 'a'] })).toBe('archived');
  });

  it('says the chat is not available when it is nowhere', () => {
    expect(missingChatState('a', { ...SETTLED, archivedIds: ['b'] })).toBe('gone');
  });
});
