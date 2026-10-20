import { DEFAULT_ENGINE, NO_PRICES, type SignalInput } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { CallDesk } from '../../src/assistant-voice/call-desk';
import type { LiveOptions, LiveSession, VoiceProvider } from '../../src/assistant-voice/gemini';
import { emitReachSignals } from '../../src/server/reach-signals';
import { SignalBus } from '../../src/signals/bus';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const START = Date.parse('2026-10-18T10:00:00.000Z');

let opened: TestStore;
let chatId: string;
let now: number;
let heard: SignalInput[];
let stop: () => void;

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
  live: (_options: LiveOptions) => Promise.resolve(session),
};

function endpointOf(id: string): {
  readonly id: string;
  readonly clientId: string;
  readonly send: () => void;
  readonly audio: () => void;
} {
  return { id, clientId: 'client', send: (): void => undefined, audio: (): void => undefined };
}

function deskOf(): CallDesk {
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
    cameras: { name: (): string => 'camera', watch: (): (() => void) => (): void => undefined },
    now: (): Date => new Date(now),
    log: testLogger('call-desk'),
  });
  const bus = new SignalBus({ log: testLogger('signals'), now: (): Date => new Date(now) });
  bus.subscribe((signal) => {
    if (signal.source === 'call') heard.push(signal);
  });
  stop = emitReachSignals(
    bus,
    {
      voice: desk,
      claims: { onArbitrated: (): (() => void) => (): void => undefined },
      listening: { onStateChanged: (): (() => void) => (): void => undefined },
    },
    (): Date => new Date(now),
  );
  return desk;
}

function owner(): ReturnType<TestStore['store']['clients']['create']> {
  return opened.store.clients.create({
    name: 'Pixel',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
}

beforeEach(async () => {
  opened = await testStore();
  now = START;
  heard = [];
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
  stop();
  await opened.close();
});

describe('call signals', () => {
  it('fire a start and an end with the length in seconds', async () => {
    const desk = deskOf();
    const client = owner();
    const profile = opened.store.profiles.activeOf(client.id);
    await desk.start(endpointOf('app-1'), client, {
      type: 'call_start',
      callId: 'call-1',
      source: 'orb',
      device: 'Phone',
    });
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      source: 'call',
      kind: 'started',
      subject: profile.id,
      profileId: profile.id,
      value: true,
      data: { callId: 'call-1', source: 'orb', person: profile.name, device: 'Phone' },
    });
    now += 95_400;
    await desk.hangUp('app-1', 'call-1', 'hung_up');
    expect(heard).toHaveLength(2);
    expect(heard[1]).toMatchObject({
      kind: 'ended',
      subject: profile.id,
      value: 95,
      data: { callId: 'call-1', ending: 'hung_up', durationSeconds: 95, source: 'orb' },
    });
    expect(heard[1]?.at).toBe(new Date(now).toISOString());
  });

  it('call a call the hub placed itself hosted and name the place', async () => {
    const desk = deskOf();
    const profileId = opened.store.profiles.first().id;
    const hosted = await desk.host({
      callId: 'call-hosted',
      endpoint: endpointOf('hosted-1'),
      caller: { profileId, role: 'owner', label: 'Living room camera' },
      opening: { chatId, text: 'hello', outreachId: null },
      speaking: { hiddenTools: new Set() },
    });
    now += 12_000;
    await hosted.end('finished');
    expect(heard.map((signal) => signal.kind)).toStrictEqual(['started', 'ended']);
    expect(heard[0]?.data).toMatchObject({ source: 'hosted', device: 'Living room camera' });
    expect(heard[1]).toMatchObject({
      value: 12,
      data: { ending: 'finished', source: 'hosted', device: 'Living room camera' },
    });
  });

  it('end the replaced call before the new one starts', async () => {
    const desk = deskOf();
    const client = owner();
    const start = (callId: string): Promise<void> =>
      desk.start(endpointOf('app-1'), client, {
        type: 'call_start',
        callId,
        source: 'chat',
        device: 'Phone',
      });
    await start('first');
    now += 3000;
    await start('second');
    expect(heard.map((signal) => [signal.kind, signal.data['callId']])).toStrictEqual([
      ['started', 'first'],
      ['ended', 'first'],
      ['started', 'second'],
    ]);
    expect(heard[1]?.data['ending']).toBe('replaced');
    await desk.hangUp('app-1', 'second', 'hung_up');
  });

  it('carry no transcript, only who, where and how long', async () => {
    const desk = deskOf();
    await desk.start(endpointOf('app-1'), owner(), {
      type: 'call_start',
      callId: 'call-1',
      source: 'chat',
      device: 'Phone',
    });
    await desk.hangUp('app-1', 'call-1', 'finished');
    for (const signal of heard) {
      expect(Object.keys(signal.data).sort()).toStrictEqual(
        signal.kind === 'started'
          ? ['callId', 'device', 'person', 'source']
          : ['callId', 'device', 'durationSeconds', 'ending', 'person', 'source'],
      );
    }
  });

  it('keep a burst of calls within the burst cap of the person', async () => {
    const desk = deskOf();
    const client = owner();
    for (let index = 0; index < 6; index += 1) {
      await desk.start(endpointOf('app-' + String(index)), client, {
        type: 'call_start',
        callId: 'call-' + String(index),
        source: 'chat',
        device: 'Phone',
      });
    }
    expect(heard.filter((signal) => signal.kind === 'started')).toHaveLength(5);
    await desk.stop();
  });
});
