import { describe, expect, it } from 'vitest';
import { callSearchesWeb, type VoiceWho } from '../../src/assistant-voice/voice-kit';

function whoOf(granted: readonly string[] | null): VoiceWho {
  return {
    caller: {
      clientId: null,
      profileId: 'owner',
      role: 'owner',
      person: 'Owner',
      device: 'Hub',
      machine: null,
    },
    chatId: 'chat',
    chatTools: granted,
    place: null,
    speaking: null,
    canSee: false,
  };
}

describe('call web search follows the chat tool grants', () => {
  it('searches the web when the chat may use every tool', () => {
    expect(callSearchesWeb(whoOf(null))).toBe(true);
  });

  it('searches the web when the chat grants web search', () => {
    expect(callSearchesWeb(whoOf(['web_search']))).toBe(true);
  });

  it('does not search the web when the chat withholds it', () => {
    expect(callSearchesWeb(whoOf(['light_on']))).toBe(false);
  });
});
