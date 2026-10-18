import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE, NO_PRICES } from '@smarteverything/domain';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { CallDesk } from '../../src/assistant-voice/call-desk';
import type { LiveEvents, LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import type { HostedCall } from '../../src/assistant-voice/outreach';
import type { SpeakingCall, SpeakingMedia } from '../../src/reach/room-media';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const FRAME_SAMPLES = 480;

let opened: TestStore;
let events: LiveEvents | null;
let chatId: string;
let seen: string[];

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
    seen.push(`${call.id}:${String(call.deviceId)}:${String(speaking)}`);
  },
};

async function hostedCall(): Promise<HostedCall> {
  const desk = new CallDesk({
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
    cameras: { name: (): string => 'camera', watch: () => (): void => undefined },
    roomMedia,
    now: (): Date => new Date('2026-10-10T10:00:00.000Z'),
    log: testLogger('room-media'),
  });
  return desk.host({
    callId: 'call-camera',
    endpoint: { id: 'camera:1', send: (): void => undefined, audio: (): void => undefined },
    caller: { profileId: opened.store.profiles.first().id, role: 'owner', label: 'Camera' },
    opening: { chatId, text: 'hello', outreachId: null },
    speaking: { hiddenTools: new Set() },
    deviceId: 'camera-device',
  });
}

beforeEach(async () => {
  opened = await testStore();
  events = null;
  seen = [];
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

describe('room media around the assistant speaking', () => {
  it('reports the start of speech once and its end when the turn completes', async () => {
    const call = await hostedCall();
    events?.audio(new Int16Array(FRAME_SAMPLES));
    events?.audio(new Int16Array(FRAME_SAMPLES));
    expect(seen).toStrictEqual(['call-camera:camera-device:true']);
    events?.turnComplete();
    expect(seen).toStrictEqual([
      'call-camera:camera-device:true',
      'call-camera:camera-device:false',
    ]);
    await call.end('finished');
  });

  it('reports the end when the person interrupts', async () => {
    const call = await hostedCall();
    events?.audio(new Int16Array(FRAME_SAMPLES));
    events?.interrupted();
    expect(seen.at(-1)).toBe('call-camera:camera-device:false');
    await call.end('finished');
  });
});
