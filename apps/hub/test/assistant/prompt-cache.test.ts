import { describe, expect, it } from 'vitest';
import {
  cacheSession,
  explicitCache,
  prefixBreakpoint,
} from '../../src/assistant/engines/openrouter/cache';
import {
  stableMessage,
  turnMessage,
  type PromptFacts,
} from '../../src/assistant/engines/openrouter/context';
import { usageOf } from '../../src/assistant/engines/openrouter/turn-loop';
import { OpenRouterClient } from '../../src/openrouter/client';

function facts(change: Partial<PromptFacts>): PromptFacts {
  return {
    name: 'Coordinator',
    profileName: 'Sam',
    role: 'owner',
    homeName: 'Home',
    timeZone: 'Europe/Berlin',
    now: new Date('2026-10-10T08:00:00.000Z'),
    instructions: 'Keep it short.',
    toolIndex: 'get_weather: The weather now.',
    catalogue: 'fan_boost(speed: integer): Boosts the fan.',
    chat: { id: 'chat-1', title: 'New chat', kind: 'chat' },
    ...change,
  };
}

describe('the cached prompt prefix', () => {
  it('keeps the stable message byte-identical across people, chats and time', () => {
    const first = stableMessage(facts({}));
    const other = stableMessage(
      facts({
        profileName: 'Alex',
        role: 'member',
        now: new Date('2026-10-11T19:42:00.000Z'),
        chat: { id: 'chat-2', title: 'Garden', kind: 'subagent' },
      }),
    );
    expect(JSON.stringify(other)).toBe(JSON.stringify(first));
    expect(JSON.stringify(first)).not.toContain('Sam');
    expect(JSON.stringify(first)).not.toContain('chat-1');
    expect(JSON.stringify(first)).not.toMatch(/2026|Europe\/Berlin/);
  });

  it('lists every tool and the tool guide in the stable message', () => {
    const { content } = stableMessage(facts({}));
    expect(content).toContain('get_weather: The weather now.');
    expect(content).toContain('Tool guide');
    expect(content).toContain('fan_boost(speed: integer)');
  });

  it('puts the person, chat and local time last, in a message after the history', () => {
    const turn = turnMessage(facts({}));
    expect(turn.role).toBe('user');
    expect(turn.content).toContain('Person: Sam, the owner of the home.');
    expect(turn.content).toContain('chatId chat-1');
    expect(turn.content).toContain('Europe/Berlin');
  });

  it('marks cache breakpoints and a shared routing session only where they apply', () => {
    expect(explicitCache('anthropic/claude-sonnet-5')).toBe(true);
    expect(explicitCache('google/gemini-3.5-flash')).toBe(false);
    expect(prefixBreakpoint('anthropic/claude-sonnet-5')).toBe(true);
    expect(prefixBreakpoint('openai/gpt-6-luna')).toBe(false);
    expect(cacheSession('openai/gpt-6-luna')).toBe(cacheSession('openai/gpt-6-luna'));
  });

  it('books cache writes with the usage', () => {
    const entry = usageOf(
      {
        generationId: 'gen-1',
        model: 'anthropic/claude-sonnet-5',
        text: '',
        reasoningDetails: [],
        toolCalls: [],
        finishReason: 'stop',
        usage: {
          cost: 0.01,
          promptTokens: 30_000,
          completionTokens: 10,
          cachedTokens: 0,
          cacheWriteTokens: 29_000,
          reasoningTokens: 0,
          audioTokens: 0,
          upstreamCost: null,
        },
      },
      'anthropic/claude-sonnet-5',
      'chat',
    );
    expect(entry.meta).toEqual({ cache_write_tokens: 29_000 });
  });

  it('sends the first system message as a cached block when asked', async () => {
    const bodies: unknown[] = [];
    const client = new OpenRouterClient({
      key: (): string => 'test-key',
      fetch: (_url, init): Promise<Response> => {
        bodies.push(JSON.parse(typeof init?.body === 'string' ? init.body : ''));
        return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      },
    });
    const request = {
      model: 'anthropic/claude-sonnet-5',
      messages: [stableMessage(facts({})), turnMessage(facts({}))],
      effort: null,
      prefixBreakpoint: true,
      sessionId: cacheSession('anthropic/claude-sonnet-5'),
    };
    try {
      for await (const chunk of client.chat(request, new AbortController().signal)) {
        expect(chunk).toBeDefined();
      }
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
    }
    const [body] = bodies;
    expect(body).toMatchObject({
      session_id: 'smarteverything:anthropic/claude-sonnet-5',
      messages: [
        { role: 'system', content: [{ cache_control: { type: 'ephemeral' } }] },
        { role: 'user' },
      ],
    });
  });
});
