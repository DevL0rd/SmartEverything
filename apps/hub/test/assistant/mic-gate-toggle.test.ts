import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE, NO_PRICES } from '@smarteverything/domain';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { CallDesk } from '../../src/assistant-voice/call-desk';
import { PLAYOUT_SLACK_MS } from '../../src/assistant-voice/call-link';
import type { LiveEvents, LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import type { HostedCall, HostedListening } from '../../src/assistant-voice/outreach';
import { captureLogs, testLogger, type CapturedLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const CHUNK = 320;
const FRAME_SAMPLES = 480;

let opened: TestStore;
let heardChunks: number;
let events: LiveEvents | null;
let chatId: string;
let logs: CapturedLogs;

const session: LiveSession = {
  audio: (): void => {
    heardChunks += 1;
  },
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

function deskOf(): CallDesk {
  return new CallDesk({
    store: opened.store,
    provider,
    responder: {
      ready: () => null,
      chatForCall: () => chatId,
      request: () => 'event-1',
      callEnded: (): void => undefined,
    },
    tools: new ToolHub([]),
    prices: { priceOf: () => NO_PRICES },
    cameras: { name: () => 'camera', watch: () => (): void => undefined },
    now: () => new Date('2026-10-10T10:00:00.000Z'),
    log: testLogger('mic-gate'),
  });
}

async function hostWith(listening: HostedListening | undefined): Promise<HostedCall> {
  return deskOf().host({
    callId: 'call-camera',
    endpoint: { id: 'camera:1', send: (): void => undefined, audio: (): void => undefined },
    caller: { profileId: opened.store.profiles.first().id, role: 'owner', label: 'Camera' },
    opening: { chatId, text: 'hello', outreachId: null },
    speaking: { hiddenTools: new Set() },
    ...(listening === undefined ? {} : { listening }),
  });
}

function mic(call: HostedCall, chunks: number): void {
  for (let index = 0; index < chunks; index++) {
    call.hear(Int16Array.from({ length: CHUNK }, (_, at) => (at % 2 === 0 ? 800 : -800)));
  }
}

async function speakingCall(listening: HostedListening | undefined): Promise<HostedCall> {
  const call = await hostWith(listening);
  events?.audio(new Int16Array(FRAME_SAMPLES * 10));
  return call;
}

beforeEach(async () => {
  opened = await testStore();
  heardChunks = 0;
  events = null;
  logs = captureLogs();
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

describe('camera microphone gate toggle', () => {
  it('drops the microphone while the AI is audible when the gate is on', async () => {
    const call = await speakingCall(undefined);
    mic(call, 20);
    expect(heardChunks).toBe(0);
    await call.end('finished');
  });

  it('keeps streaming the microphone while the AI is audible when the gate is off', async () => {
    const call = await speakingCall({ echoFree: true, playoutSlackMs: PLAYOUT_SLACK_MS.open });
    mic(call, 20);
    expect(heardChunks).toBe(20);
    await call.end('finished');
  });

  it('still reports the microphone summary with the gate off', async () => {
    const call = await speakingCall({ echoFree: true, playoutSlackMs: PLAYOUT_SLACK_MS.open });
    mic(call, 5);
    await call.end('finished');
    expect(logs.events()).toContain('voice.mic_summarized');
    expect(logs.events()).not.toContain('voice.mic_gated');
  });
});
