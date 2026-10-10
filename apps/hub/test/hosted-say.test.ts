import { NO_PRICES } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ToolSpec } from '../src/ai-tools/hub-tool';
import { Announcer } from '../src/assistant-voice/announcer';
import type { LiveOptions, LiveSession, VoiceProvider } from '../src/assistant-voice/gemini';
import { SAY_INSTRUCTIONS } from '../src/assistant-voice/instructions';
import { hostedSet } from '../src/assistant-voice/voice-tools';
import { CONVERSATION } from '../src/reach/hosted-call';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const SPEECH = new Int16Array(4800).fill(1200);

interface Heard {
  readonly options: LiveOptions[];
  readonly texts: string[];
}

function fakeProvider(heard: Heard): VoiceProvider {
  return {
    live: (options, events): Promise<LiveSession> => {
      heard.options.push(options);
      return Promise.resolve({
        audio: () => undefined,
        speaking: () => undefined,
        text: (text): void => {
          heard.texts.push(text);
          queueMicrotask(() => {
            events.audio(SPEECH);
            events.turnComplete();
          });
        },
        toolResult: () => undefined,
        video: () => undefined,
        close: () => undefined,
      });
    },
  };
}

let opened: TestStore;

beforeEach(async () => {
  opened = await testStore();
});

afterEach(async () => {
  await opened.close();
});

describe('saying something once', () => {
  it('speaks the exact text with no tools, no chat and no transcript', async () => {
    const heard: Heard = { options: [], texts: [] };
    const packets: Uint8Array[] = [];
    let said = 0;
    const messagesBefore = opened.store.assistantChat.recent(opened.store.profiles.first().id, 50);
    const announcer = new Announcer({
      store: opened.store,
      provider: fakeProvider(heard),
      prices: { priceOf: (): typeof NO_PRICES => NO_PRICES },
      log: testLogger('say'),
    });
    const announcement = await announcer.say({
      id: '1d000000-0000-4000-8000-000000000041',
      profileId: opened.store.profiles.first().id,
      clientId: null,
      text: 'Dinner is ready',
      sink: {
        audio: (packet): void => {
          packets.push(packet);
        },
        said: (): void => {
          said += 1;
        },
        ended: () => undefined,
      },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    await announcement.end('finished');
    expect(heard.options[0]?.tools).toEqual([]);
    expect(heard.options[0]?.system).toBe(SAY_INSTRUCTIONS);
    expect(heard.texts).toEqual(['Dinner is ready']);
    expect(packets.length).toBeGreaterThan(0);
    expect(said).toBe(1);
    expect(opened.store.assistantChat.recent(opened.store.profiles.first().id, 50)).toEqual(
      messagesBefore,
    );
  });

  it('hides the reach tools from hosted conversations', () => {
    const set: ToolSpec[] = ['get_device', 'speak', 'call', 'hang_up'].map((name) => ({
      name,
      description: name,
      inputSchema: {},
    }));
    expect(hostedSet(set, CONVERSATION).map((entry) => entry.name)).toEqual(['get_device']);
    expect(hostedSet(set, null)).toHaveLength(4);
  });
});
