import { LiveServerMessage, type LiveCallbacks, type LiveConnectConfig } from '@google/genai';
import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  Gemini,
  liveConfigOf,
  type LiveConnect,
  type LiveEvents,
  type LiveOptions,
} from '../../src/assistant-voice/gemini';
import { changedParts, partsOf } from '../../src/assistant-voice/warm-policy';

const options: LiveOptions = {
  model: 'gemini-3.8-live-extended-thinking',
  voice: 'Puck',
  system: 'be brief',
  tools: [],
  webSearch: false,
  resume: null,
  window: null,
  automatic: true,
};

interface Opened {
  readonly config: LiveConnectConfig;
  readonly callbacks: LiveCallbacks;
  readonly toolResponses: unknown[];
}

function message(fields: Record<string, unknown>): LiveServerMessage {
  return Object.assign(new LiveServerMessage(), fields);
}

function events(): LiveEvents & { readonly turnComplete: Mock<() => void> } {
  return {
    audio: vi.fn(),
    said: vi.fn(),
    heard: vi.fn(),
    interrupted: vi.fn(),
    turnComplete: vi.fn<() => void>(),
    tool: vi.fn(),
    resumable: vi.fn(),
    usage: vi.fn(),
    closed: vi.fn(),
  };
}

async function open(
  live: LiveOptions,
  listener: LiveEvents,
): Promise<{ opened: Opened; session: Awaited<ReturnType<Gemini['live']>> }> {
  const sockets: Opened[] = [];
  const connect: LiveConnect = (_key, params) => {
    const opened: Opened = {
      config: params.config ?? {},
      callbacks: params.callbacks,
      toolResponses: [],
    };
    sockets.push(opened);
    return Promise.resolve({
      sendRealtimeInput: vi.fn(),
      sendClientContent: vi.fn(),
      sendToolResponse: (response): void => {
        opened.toolResponses.push(response);
      },
      close: vi.fn(),
    });
  };
  const session = await new Gemini(() => 'test-key', connect).live(live, listener);
  const [opened] = sockets;
  if (opened === undefined) {
    throw new Error('no session opened');
  }
  return { opened, session };
}

describe('voice thinking in the live setup', () => {
  it('sends no thinking config when no level was chosen', () => {
    const config = liveConfigOf({ ...options, model: 'gemini-3.8-live' });
    expect(config).not.toHaveProperty('thinkingConfig');
  });

  it('sends the chosen level and keeps thought text out of the call', () => {
    for (const [thinking, level] of [
      ['low', 'LOW'],
      ['medium', 'MEDIUM'],
      ['high', 'HIGH'],
    ] as const) {
      expect(liveConfigOf({ ...options, thinking }).thinkingConfig).toEqual({
        thinkingLevel: level,
        includeThoughts: false,
      });
    }
  });

  it('answers tools without scheduling, which the thinking model refuses', async () => {
    const { opened, session } = await open({ ...options, thinking: 'low' }, events());
    session.toolResult('call-1', 'lights', { ok: true }, { scheduling: 'idle', more: false });
    expect(opened.toolResponses).toEqual([
      {
        functionResponses: [
          { id: 'call-1', name: 'lights', response: { ok: true }, willContinue: false },
        ],
      },
    ]);
  });

  it('keeps scheduling for the quick model', async () => {
    const { opened, session } = await open({ ...options, model: 'gemini-3.8-live' }, events());
    session.toolResult('call-1', 'lights', { ok: true }, { scheduling: 'idle', more: false });
    expect(JSON.stringify(opened.toolResponses)).toContain('WHEN_IDLE');
  });

  it('ends the turn only when the background work is idle', async () => {
    const listener = events();
    const { opened } = await open({ ...options, thinking: 'low' }, listener);
    const deliver = (fields: Record<string, unknown>): void => {
      opened.callbacks.onmessage(message(fields));
    };
    deliver({ serverContent: { turnComplete: true, interactionStatus: 'IN_PROGRESS' } });
    deliver({ toolCall: { functionCalls: [] }, interactionStatus: 'IN_PROGRESS' });
    expect(listener.turnComplete).not.toHaveBeenCalled();
    deliver({ serverContent: { turnComplete: true, interactionStatus: 'IDLE' } });
    expect(listener.turnComplete).toHaveBeenCalledTimes(1);
    deliver({ serverContent: { turnComplete: true } });
    expect(listener.turnComplete).toHaveBeenCalledTimes(2);
  });

  it('ends a held turn when idle arrives on its own', async () => {
    const listener = events();
    const { opened } = await open({ ...options, thinking: 'low' }, listener);
    opened.callbacks.onmessage(
      message({ serverContent: { turnComplete: true, interactionStatus: 'IN_PROGRESS' } }),
    );
    opened.callbacks.onmessage(message({ interactionStatus: 'IDLE' }));
    expect(listener.turnComplete).toHaveBeenCalledTimes(1);
  });

  it('reopens a warm session when the thinking level changes', () => {
    const held = partsOf({ ...options, thinking: 'low' });
    expect(changedParts(held, partsOf({ ...options, thinking: 'high' }))).toEqual(['thinking']);
    expect(changedParts(held, partsOf({ ...options, thinking: 'low' }))).toEqual([]);
  });
});
