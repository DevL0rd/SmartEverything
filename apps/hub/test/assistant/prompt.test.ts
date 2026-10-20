import { describe, expect, it } from 'vitest';
import { DEFAULT_RESPONSE_STYLE } from '@smarteverything/domain';
import { PLAY } from '../../src/assistant/personality';
import {
  stablePrompt,
  turnPrompt,
  type PromptFacts,
} from '../../src/assistant/conversation/prompt';

function facts(change: Partial<PromptFacts>): PromptFacts {
  return {
    name: 'Coordinator',
    profileName: 'Sam',
    role: 'owner',
    homeName: 'Home',
    timeZone: 'Europe/Berlin',
    now: new Date('2026-10-10T08:00:00.000Z'),
    boardTypes: [],
    interruption: null,
    instructions: 'Keep it short.',
    toolIndex: 'get_weather: The weather now.',
    catalogue: 'fan_boost(speed: integer): Boosts the fan.',
    chat: { id: 'chat-1', title: 'New chat', kind: 'chat' },
    ...change,
  };
}

describe('the stable prompt prefix', () => {
  it('is byte-identical across people, chats and time, so the provider can cache it', () => {
    const first = stablePrompt(facts({}));
    const other = stablePrompt(
      facts({
        profileName: 'Alex',
        role: 'member',
        now: new Date('2026-10-11T19:42:00.000Z'),
        chat: { id: 'chat-2', title: 'Garden', kind: 'subagent' },
      }),
    );
    expect(other).toBe(first);
    expect(first).not.toContain('Sam');
    expect(first).not.toContain('chat-1');
    expect(first).not.toMatch(/2026|Europe\/Berlin/);
  });

  it('lists every enabled tool, the plugin catalogue and the owner instructions', () => {
    const text = stablePrompt(facts({}));
    expect(text).toContain('get_weather: The weather now.');
    expect(text).toContain('fan_boost(speed: integer)');
    expect(text).toContain('Owner instructions:\nKeep it short.');
    expect(stablePrompt(facts({ toolIndex: '', catalogue: '', instructions: '' }))).not.toContain(
      'Owner instructions',
    );
  });
});

describe('the per-turn prompt', () => {
  it('carries the person, the chat and the local time, which the stable prefix leaves out', () => {
    const text = turnPrompt(facts({}));
    expect(text).toContain('Person: Sam, the owner of the home.');
    expect(text).toContain('chatId chat-1');
    expect(text).toContain('Europe/Berlin');
  });

  it('names the plugin board types of the home, and nothing when there are none', () => {
    expect(turnPrompt(facts({ boardTypes: ['router', 'aibi'] }))).toContain(
      'Board types for show_widgets kind board: router, aibi.',
    );
    expect(turnPrompt(facts({}))).not.toContain('Board types');
  });

  it('carries the interruption note only when the last turn was interrupted', () => {
    expect(turnPrompt(facts({}))).not.toContain('interrupted');
    expect(
      turnPrompt(
        facts({ interruption: 'Your previous turn was interrupted (stopped by the user).' }),
      ),
    ).toContain('Note: Your previous turn was interrupted (stopped by the user).');
  });

  it('teaches the AI to continue from an interruption note, in the cached prefix', () => {
    expect(stablePrompt(facts({}))).toContain('Carry on with that work');
  });

  it('tells a member what is not theirs and a subagent where its result goes', () => {
    const text = turnPrompt(
      facts({ role: 'member', chat: { id: 'chat-3', title: 'Helper', kind: 'subagent' } }),
    );
    expect(text).toContain('a member of the home');
    expect(text).toContain('subagent chat');
  });
});

describe('what the AI is told about dates, changes and widgets', () => {
  it('resolves relative dates from the local time and reports local rather than UTC times', () => {
    const text = stablePrompt(facts({}));
    expect(text).toContain('come from the local time in your context');
    expect(text).toContain('Times in tool results are UTC');
  });

  it('makes no change to an automation, scene or schedule that nobody asked for', () => {
    const text = stablePrompt(facts({}));
    expect(text).toMatch(/only when the person asked for that; otherwise suggest it in words/u);
    expect(text).toContain(
      'look for the tool (search_tools, list_operations) before saying you cannot',
    );
  });

  it('keeps widgets off short answers, commands and brief replies instead of always attaching one', () => {
    const text = stablePrompt(facts({}));
    expect(text).not.toContain('Always attach');
    expect(text).toContain('Add none to a short answer, a plain command');
  });

  it('keeps the AI and tool steps of automations with the owner for a member', () => {
    expect(turnPrompt(facts({ role: 'member' }))).toContain('AI and tool steps of automations');
  });
});

describe('the text chat personality', () => {
  it('follows the identity line, before the rules and the tool guide', () => {
    const text = stablePrompt(
      facts({ responseStyle: { ...DEFAULT_RESPONSE_STYLE, personality: 'wry' } }),
    );
    const personality = text.indexOf('Your personality, which you keep in every reply: Wry');
    expect(personality).toBeGreaterThan(0);
    expect(personality).toBeLessThan(text.indexOf(PLAY));
    expect(text.indexOf(PLAY)).toBeLessThan(text.indexOf('Tools are how you see'));
    expect(text.indexOf(PLAY)).toBeLessThan(text.indexOf('Ids and keys come from reads'));
    expect(text.indexOf('Owner instructions')).toBeLessThan(text.indexOf('Tools are how you see'));
  });

  it('defaults to warm, witty and playful and keeps tone out of the presentation preferences', () => {
    const text = stablePrompt(
      facts({ responseStyle: { ...DEFAULT_RESPONSE_STYLE, verbosity: 'brief' } }),
    );
    expect(text).toContain('Warm, witty and playful');
    expect(text).toContain('Presentation preferences');
    expect(text).not.toMatch(/tone (and presentation )?only|when appropriate/iu);
    expect(stablePrompt(facts({}))).toContain('Warm, witty and playful');
  });
});
