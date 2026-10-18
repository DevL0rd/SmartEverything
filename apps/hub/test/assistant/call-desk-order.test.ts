import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE, NO_PRICES } from '@smarteverything/domain';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { CallDesk } from '../../src/assistant-voice/call-desk';
import type { LiveOptions, LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import { STAYS_OPEN_ENDING } from '../../src/assistant-voice/instructions';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

let opened: TestStore;
let systems: string[];
let sent: string[];
let chatId: string;

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
  live: (options: LiveOptions) => {
    systems.push(options.system);
    return Promise.resolve(session);
  },
};

function deskOf(): CallDesk {
  const { store } = opened;
  return new CallDesk({
    store,
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
    log: testLogger('call-desk'),
  });
}

function endpointOf(id: string): {
  readonly id: string;
  readonly clientId: string;
  readonly send: (message: { readonly type: string }) => void;
  readonly audio: () => void;
} {
  return {
    id,
    clientId: 'client',
    send: (message): void => {
      sent.push(message.type);
    },
    audio: (): void => undefined,
  };
}

beforeEach(async () => {
  opened = await testStore();
  systems = [];
  sent = [];
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

describe('call desk builds its hooks before the call exists', () => {
  it('opens an app-started call with the stay-open ending', async () => {
    const { store } = opened;
    const client = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'owner',
      tokenHash: 'a'.repeat(64),
    });
    const desk = deskOf();
    await desk.start(endpointOf('app-1'), client, {
      type: 'call_start',
      callId: 'call-app',
      source: 'assistant',
      device: 'Phone',
    });
    expect(systems).toHaveLength(1);
    expect(systems[0]).toContain(STAYS_OPEN_ENDING);
    expect(sent).not.toContain('ended');
    await desk.hangUp('app-1', 'call-app', 'hung_up');
  });

  it('opens a hosted call without the stay-open ending', async () => {
    const { store } = opened;
    const desk = deskOf();
    const hosted = await desk.host({
      callId: 'call-hosted',
      endpoint: endpointOf('hosted-1'),
      caller: { profileId: store.profiles.first().id, role: 'owner', label: 'Camera' },
      opening: { chatId, text: 'hello', outreachId: null },
      speaking: { hiddenTools: new Set() },
    });
    expect(systems).toHaveLength(1);
    expect(systems[0]).not.toContain(STAYS_OPEN_ENDING);
    expect(sent).not.toContain('ended');
    await hosted.end('finished');
  });
});

describe('call desk keeps every call through a short disconnect', () => {
  it('resumes a call that never sent sight settings on a new endpoint', async () => {
    const { store } = opened;
    const client = store.clients.create({
      name: 'Pixel',
      platform: 'android',
      role: 'owner',
      tokenHash: 'b'.repeat(64),
    });
    const desk = deskOf();
    await desk.start(endpointOf('app-1'), client, {
      type: 'call_start',
      callId: 'call-resume',
      source: 'assistant',
      device: 'Phone',
    });
    desk.detach('app-1');
    expect(sent).not.toContain('ended');
    const second: string[] = [];
    desk.resume(
      { ...endpointOf('app-2'), send: (message): void => void second.push(message.type) },
      client,
      'call-resume',
    );
    expect(second).not.toContain('ended');
    await desk.hangUp('app-2', 'call-resume', 'hung_up');
    expect(second).toContain('ended');
  });
});
