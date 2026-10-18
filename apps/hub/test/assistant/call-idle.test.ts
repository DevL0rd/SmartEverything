import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_VOICE_SETTINGS, type AssistantVoiceSettings } from '@smarteverything/domain';
import type { CallLink } from '../../src/assistant-voice/call-link';
import { Conversation } from '../../src/assistant-voice/conversation';
import type { ConversationHooks } from '../../src/assistant-voice/conversation-hooks';
import type { LiveEvents, LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import { IdleClock, REPLY_GRACE_MS } from '../../src/assistant-voice/idle-clock';
import type { SpeechSource } from '../../src/assistant-voice/speech-input';
import { plainLine } from '../../src/assistant-voice/voice-line';
import { captureLogs } from '../support/logs';

const CHUNK = 320;
const CHUNK_MS = 20;
const IDLE_MS = ASSISTANT_VOICE_SETTINGS.parse({}).idle_seconds * 1000;

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`fixtures/${name}.pcm`, import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function repeated(pcm: Int16Array, times: number): Int16Array {
  const out = new Int16Array(pcm.length * times);
  for (let index = 0; index < times; index += 1) {
    out.set(pcm, index * pcm.length);
  }
  return out;
}

const session: LiveSession = {
  audio: (): void => undefined,
  speaking: (): void => undefined,
  text: (): void => undefined,
  picture: (): void => undefined,
  toolResult: (): void => undefined,
  video: (): void => undefined,
  close: (): void => undefined,
};

const link: CallLink = {
  audio: () => undefined,
  cut: () => undefined,
  playing: () => false,
  state: () => undefined,
  caption: () => undefined,
};

function hooksOf(speech: SpeechSource, endings: string[]): ConversationHooks {
  return {
    speech,
    settings: (): AssistantVoiceSettings => ASSISTANT_VOICE_SETTINGS.parse({}),
    system: (): string => 'system',
    note: (): string => '',
    history: (): string[] => [],
    tools: (): [] => [],
    webSearch: (): boolean => false,
    window: (): null => null,
    record: (): void => undefined,
    task: (): string => 'event',
    run: (): Promise<never> => new Promise(() => undefined),
    ended: (reason): void => {
      endings.push(reason);
    },
    usage: (): void => undefined,
    measured: (): void => undefined,
    stalled: (): void => undefined,
    staysOpenWhenQuiet: (): boolean => false,
  };
}

interface Call {
  readonly conversation: Conversation;
  readonly endings: string[];
  readonly events: () => LiveEvents | null;
  readonly feed: (pcm: Int16Array) => Promise<void>;
  readonly wait: (ms: number) => Promise<void>;
}

async function call(speech: SpeechSource): Promise<Call> {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  let clock = 0;
  const endings: string[] = [];
  let events: LiveEvents | null = null;
  const provider: VoiceProvider = {
    live: (_options, given) => {
      events = given;
      return Promise.resolve(session);
    },
  };
  const conversation = new Conversation(
    plainLine(provider),
    link,
    hooksOf(speech, endings),
    () => clock,
  );
  await conversation.start(null);
  await new Promise((resolve) => setTimeout(resolve, 500));
  const step = async (): Promise<void> => {
    clock += CHUNK_MS;
    if (clock % 100 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
      vi.advanceTimersByTime(100);
    }
  };
  return {
    conversation,
    endings,
    events: () => events,
    feed: async (pcm): Promise<void> => {
      for (let offset = 0; offset < pcm.length && endings.length === 0; offset += CHUNK) {
        conversation.hear(pcm.subarray(offset, offset + CHUNK));
        await step();
      }
    },
    wait: async (ms): Promise<void> => {
      for (let waited = 0; waited < ms && endings.length === 0; waited += CHUNK_MS) {
        await step();
      }
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('call idle end', () => {
  it('never hangs up on a person who talks for over half a minute through the camera', async () => {
    const logs = captureLogs();
    const camera = await call('echo-free');
    camera.events()?.audio(new Int16Array(480));
    camera.events()?.turnComplete();
    await camera.feed(repeated(fixture('person'), 7));
    expect(camera.endings).toEqual([]);
    await camera.feed(new Int16Array((IDLE_MS + REPLY_GRACE_MS + 2000) * 16));
    expect(camera.endings).toEqual(['idle']);
    const ended = logs.records.find((record) => record.event === 'conversation.idle_ended');
    expect(ended?.payload).toMatchObject({ idleMs: IDLE_MS, speech: 'echo-free' });
    expect(Number(ended?.payload['speechTurns'])).toBeGreaterThan(0);
    expect(Number(ended?.payload['sinceSpeechMs'])).toBeGreaterThan(IDLE_MS);
    await camera.conversation.end('hung_up');
  });

  it('still ends a call where nobody speaks', async () => {
    const camera = await call('raw');
    await camera.wait(REPLY_GRACE_MS + 500);
    expect(camera.endings).toEqual(['idle']);
    await camera.conversation.end('hung_up');
  });

  it('waits while a person holds the talk button', async () => {
    const app = await call('gated-client');
    app.conversation.activity(true);
    await app.wait(25_000);
    expect(app.endings).toEqual([]);
    app.conversation.activity(false);
    app.events()?.audio(new Int16Array(480));
    app.events()?.turnComplete();
    await app.wait(IDLE_MS + REPLY_GRACE_MS);
    expect(app.endings).toEqual(['idle']);
  });
});

describe('IdleClock', () => {
  it('counts idle from the later of the person’s speech and the model’s work', () => {
    let now = 0;
    const idle = new IdleClock(() => now);
    idle.person(true);
    now = 60_000;
    expect(idle.expired(5000)).toBeNull();
    idle.person(false);
    now = 65_001;
    expect(idle.expired(5000)).toEqual({
      idleMs: 5000,
      sinceSpeechMs: 5001,
      sinceModelMs: 65_001,
      speechTurns: 1,
    });
    idle.model();
    now = 65_001 + REPLY_GRACE_MS;
    expect(idle.expired(5000)).toBeNull();
  });
});
