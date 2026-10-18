import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE, NO_PRICES } from '@smarteverything/domain';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import type { LiveEvents, LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import { TurnSessions, type TurnRequest } from '../../src/assistant-voice/turn-sessions';
import type { SpeakingCall, SpeakingMedia } from '../../src/reach/room-media';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let events: LiveEvents | null;
let chatId: string;
let seen: string[];
let heardByPlugin: string[];

const session: LiveSession = {
  audio: (): void => undefined,
  speaking: (): void => undefined,
  text: (): void => undefined,
  picture: (): void => undefined,
  toolResult: (): void => undefined,
  video: (): void => undefined,
  close: (): void => undefined,
};

const provider: VoiceProvider = {
  live: (_options, live) => {
    events = live;
    return Promise.resolve(session);
  },
};

const roomMedia: SpeakingMedia = {
  speaking: (call: SpeakingCall, speaking: boolean): void => {
    seen.push(`${String(call.externalId)}:${String(speaking)}`);
  },
};

async function openTurn(): Promise<Awaited<ReturnType<TurnSessions['open']>>> {
  const turns = new TurnSessions({
    store: opened.store,
    provider,
    responder: {
      ready: (): null => null,
      chatForCall: (): string => chatId,
      request: (): string => 'event-1',
      callEnded: (): void => undefined,
    },
    tools: new ToolHub([]),
    prices: { priceOf: (): typeof NO_PRICES => NO_PRICES },
    roomMedia,
    now: (): Date => new Date('2026-10-10T10:00:00.000Z'),
    log: testLogger('turn-room-media'),
  });
  const request: TurnRequest = {
    pluginId: 'plugin',
    caller: { profileId: opened.store.profiles.first().id, role: 'owner', label: 'Robot' },
    chatId,
    place: null,
    at: { deviceId: null, clientId: null, externalId: 'robot:1' },
    speaking: { hiddenTools: new Set() },
    tools: [],
    opening: null,
    events: {
      audio: (): void => {
        heardByPlugin.push('audio');
      },
      heard: (): void => undefined,
      said: (): void => undefined,
      interrupted: (): void => {
        heardByPlugin.push('interrupted');
      },
      turnComplete: (): void => {
        heardByPlugin.push('turnComplete');
      },
      ended: (): void => {
        heardByPlugin.push('ended');
      },
    },
  };
  return turns.open(request);
}

beforeEach(async () => {
  opened = await testStore();
  events = null;
  seen = [];
  heardByPlugin = [];
  chatId = opened.store.aiChats.create({
    profileId: opened.store.profiles.first().id,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  }).id;
});

afterEach(async () => {
  await opened.close();
});

describe('room media around a plugin text turn', () => {
  it('pauses on the first audio and resumes when the reply completes, still telling the plugin', async () => {
    await openTurn();
    events?.audio(new Int16Array(480));
    events?.audio(new Int16Array(480));
    expect(seen).toStrictEqual(['robot:1:true']);
    events?.turnComplete();
    expect(seen).toStrictEqual(['robot:1:true', 'robot:1:false']);
    expect(heardByPlugin).toStrictEqual(['audio', 'audio', 'turnComplete']);
  });

  it('pauses again for the next reply on the same session', async () => {
    await openTurn();
    events?.audio(new Int16Array(480));
    events?.interrupted();
    events?.audio(new Int16Array(480));
    events?.turnComplete();
    expect(seen).toStrictEqual(['robot:1:true', 'robot:1:false', 'robot:1:true', 'robot:1:false']);
  });

  it('resumes when the session ends mid-speech', async () => {
    const turn = await openTurn();
    events?.audio(new Int16Array(480));
    turn.end('hung_up');
    expect(seen).toStrictEqual(['robot:1:true', 'robot:1:false']);
    expect(heardByPlugin.at(-1)).toBe('ended');
  });
});
