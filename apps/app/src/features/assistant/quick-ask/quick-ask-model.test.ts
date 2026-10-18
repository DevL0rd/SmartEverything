import { describe, expect, it } from 'vitest';
import {
  OFFLINE_NEW_CHAT_REASON,
  chosenTarget,
  continueLabel,
  latestChat,
  newChatReason,
  preferredChoice,
  type QuickAskCandidate,
} from './quick-ask-model';

const NOW = Date.parse('2026-10-17T12:00:00.000Z');
const MINUTE = 60_000;
const ME = 'profile-me';

function chat(
  minutesAgo: number,
  change: Partial<QuickAskCandidate> = {},
): QuickAskCandidate & { readonly title: string } {
  const at = new Date(NOW - minutesAgo * MINUTE).toISOString();
  return {
    title: `chat ${String(minutesAgo)}`,
    profile_id: ME,
    kind: 'chat',
    archived_at: null,
    deletion_state: null,
    last_message_at: at,
    created_at: '2026-10-01T00:00:00.000Z',
    ...change,
  };
}

describe('the chat Quick Ask can continue', () => {
  it('is the most recently active chat of the profile, whatever the list order', () => {
    const older = chat(90);
    const newest = chat(12);
    expect(latestChat([older, newest, chat(300)], ME)).toBe(newest);
  });

  it('counts the creation time of a chat that has no message yet', () => {
    const quiet = chat(0, {
      last_message_at: null,
      created_at: new Date(NOW - MINUTE).toISOString(),
    });
    expect(latestChat([chat(30), quiet], ME)).toBe(quiet);
  });

  it('skips archived, deleting, other profiles and chats that are not conversations', () => {
    const usable = chat(500);
    const skipped = [
      chat(1, { archived_at: '2026-10-17T11:00:00.000Z' }),
      chat(2, { deletion_state: 'deleting' }),
      chat(3, { profile_id: 'someone-else' }),
      chat(4, { kind: 'subagent' }),
      chat(5, { kind: 'plugin' }),
      chat(6, { kind: 'call' }),
    ];
    expect(latestChat([...skipped, usable], ME)).toBe(usable);
  });

  it('is nothing when no chat qualifies or nobody is signed in', () => {
    expect(latestChat([], ME)).toBeNull();
    expect(latestChat([chat(5)], null)).toBeNull();
  });
});

describe('the default target follows Keep the same chat for', () => {
  it('continues a chat that was active within the window', () => {
    expect(preferredChoice(chat(119), 120, NOW)).toBe('continue');
  });

  it('starts a new chat once the window has passed, at the boundary included', () => {
    expect(preferredChoice(chat(120), 120, NOW)).toBe('new');
    expect(preferredChoice(chat(500), 120, NOW)).toBe('new');
  });

  it('starts a new chat when there is nothing to continue', () => {
    expect(preferredChoice(null, 120, NOW)).toBe('new');
  });

  it('lets the person override the default, except when there is nothing to continue', () => {
    expect(chosenTarget('new', 'continue', true)).toBe('new');
    expect(chosenTarget('continue', 'new', true)).toBe('continue');
    expect(chosenTarget(null, 'continue', true)).toBe('continue');
    expect(chosenTarget('continue', 'new', false)).toBe('new');
  });
});

describe('the target line', () => {
  it('names the chat and how long ago it was active', () => {
    expect(continueLabel(chat(12), NOW)).toBe('Continue “chat 12” (12 min ago)');
  });

  it('keeps a long title whole for the control to shorten', () => {
    const title = 'x'.repeat(80);
    expect(continueLabel({ ...chat(1), title }, NOW)).toContain(title);
  });
});

describe('starting a new chat while the hub is away', () => {
  it('explains that a new chat needs the hub', () => {
    expect(newChatReason('offline-cached')).toBe(OFFLINE_NEW_CHAT_REASON);
    expect(newChatReason('offline-empty')).toBe(OFFLINE_NEW_CHAT_REASON);
  });

  it('does not block while loading, reconnecting or live', () => {
    expect(newChatReason('loading')).toBeNull();
    expect(newChatReason('reconnecting')).toBeNull();
    expect(newChatReason('live')).toBeNull();
  });
});
