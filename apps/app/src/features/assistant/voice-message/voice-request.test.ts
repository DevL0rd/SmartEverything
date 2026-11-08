import { describe, expect, it } from 'vitest';
import {
  chatOnScreen,
  claimVoiceMessage,
  requestVoiceMessage,
  showChatOnScreen,
  watchVoiceRequests,
} from './voice-request';

describe('voice message requests', () => {
  it('know which chat is on screen until it leaves', () => {
    const hide = showChatOnScreen('chat-a');
    expect(chatOnScreen()).toBe('chat-a');
    hide();
    expect(chatOnScreen()).toBeNull();
  });

  it('are claimed once, by the chat they were made for', () => {
    const hide = showChatOnScreen('chat-a');
    const seen: string[] = [];
    const stop = watchVoiceRequests(() => {
      seen.push('changed');
    });
    requestVoiceMessage('chat-a');
    expect(seen).toEqual(['changed']);
    expect(claimVoiceMessage('chat-b')).toBe(false);
    expect(claimVoiceMessage('chat-a')).toBe(true);
    expect(claimVoiceMessage('chat-a')).toBe(false);
    stop();
    hide();
  });

  it('wait for the chat they were made for to come on screen', () => {
    requestVoiceMessage('chat-c');
    const hide = showChatOnScreen('chat-c');
    expect(claimVoiceMessage('chat-c')).toBe(true);
    hide();
  });

  it('are dropped when a different chat comes on screen or the chat leaves unclaimed', () => {
    requestVoiceMessage('chat-a');
    const hideB = showChatOnScreen('chat-b');
    expect(claimVoiceMessage('chat-a')).toBe(false);
    requestVoiceMessage('chat-b');
    hideB();
    expect(claimVoiceMessage('chat-b')).toBe(false);
  });
});
