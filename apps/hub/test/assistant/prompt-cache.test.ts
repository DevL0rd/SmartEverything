import { describe, expect, it } from 'vitest';
import {
  explicitCache,
  systemMessages,
  type PromptFacts,
} from '../../src/assistant/engines/openrouter/context';

function facts(change: Partial<PromptFacts>): PromptFacts {
  return {
    name: 'Coordinator',
    profileName: 'Sam',
    role: 'owner',
    homeName: 'Home',
    timeZone: 'Europe/Berlin',
    now: new Date('2026-10-10T08:00:00.000Z'),
    instructions: 'Keep it short.',
    catalogue: 'get_weather(): The weather now.',
    chat: { id: 'chat-1', title: 'New chat', kind: 'chat' },
    ...change,
  };
}

describe('the cached prompt prefix', () => {
  it('keeps the first system message byte-identical across people, chats and time', () => {
    const [first] = systemMessages(facts({}));
    const [other] = systemMessages(
      facts({
        profileName: 'Alex',
        role: 'member',
        now: new Date('2026-10-11T19:42:00.000Z'),
        chat: { id: 'chat-2', title: 'Garden', kind: 'subagent' },
      }),
    );
    expect(other).toEqual(first);
    expect(JSON.stringify(first)).not.toContain('Sam');
  });

  it('puts the person, chat and local time in the second system message', () => {
    const [, turn] = systemMessages(facts({}));
    expect(turn?.content).toContain('Person: Sam, the owner of the home.');
    expect(turn?.content).toContain('chatId chat-1');
    expect(turn?.content).toContain('Europe/Berlin');
  });

  it('asks OpenRouter for explicit caching only on Anthropic models', () => {
    expect(explicitCache('anthropic/claude-sonnet-5')).toBe(true);
    expect(explicitCache('google/gemini-3.5-flash')).toBe(false);
    expect(explicitCache('openrouter/auto')).toBe(false);
  });
});
