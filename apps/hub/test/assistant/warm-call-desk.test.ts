import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ENGINE, NO_PRICES, type ClientRow } from '@smarteverything/domain';
import { ToolHub } from '../../src/ai-tools/tool-hub';
import { CallDesk } from '../../src/assistant-voice/call-desk';
import type {
  LiveEvents,
  LiveOptions,
  LiveSession,
  VoiceProvider,
} from '../../src/assistant-voice/gemini';
import { testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

interface Wire {
  readonly options: LiveOptions;
  readonly events: LiveEvents;
  readonly sent: string[];
}

let opened: TestStore;
let wires: Wire[];
let chatId: string;

const provider: VoiceProvider = {
  live: (options, events) => {
    const wire: Wire = { options, events, sent: [] };
    wires.push(wire);
    const session: LiveSession = {
      audio: (): void => undefined,
      speaking: (): void => undefined,
      text: (text): void => {
        wire.sent.push(text);
      },
      picture: (): void => undefined,
      toolResult: (): void => undefined,
      video: (): void => undefined,
      close: (): void => {
        wire.sent.push('close');
      },
      alive: () => Promise.resolve(true),
    };
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
    log: testLogger('warm-call-desk'),
  });
}

function endpointOf(id: string): {
  readonly id: string;
  readonly clientId: string;
  readonly send: () => void;
  readonly audio: () => void;
} {
  return { id, clientId: 'client', send: (): void => undefined, audio: (): void => undefined };
}

function clientOf(): ClientRow {
  return opened.store.clients.create({
    name: 'Pixel',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
}

async function orbCall(desk: CallDesk, client: ClientRow, callId: string): Promise<void> {
  await desk.start(endpointOf('app-1'), client, {
    type: 'call_start',
    callId,
    source: 'orb',
    device: 'Phone',
  });
}

function hostedCall(desk: CallDesk, callId: string): ReturnType<CallDesk['host']> {
  return desk.host({
    callId,
    endpoint: endpointOf(callId),
    caller: { profileId: opened.store.profiles.first().id, role: 'owner', label: 'Camera' },
    opening: { chatId, text: 'hello', outreachId: null },
    speaking: { hiddenTools: new Set() },
  });
}

beforeEach(async () => {
  opened = await testStore();
  wires = [];
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

describe('the call desk holds one warm Gemini session per person, chat and call kind', () => {
  it('starts the second call on the held session with no connect and a fresh conversation note', async () => {
    const desk = deskOf();
    const client = clientOf();
    await orbCall(desk, client, 'call-1');
    const [wire] = wires;
    expect(wire?.options.system).not.toContain('Local time');
    expect(wire?.sent[0]).toContain('Local time');
    expect(wire?.sent[0]).toContain('New conversation');
    wire?.events.resumable('handle-1');
    await desk.hangUp('app-1', 'call-1', 'hung_up');
    expect(wire?.sent).not.toContain('close');
    await orbCall(desk, client, 'call-2');
    expect(wires).toHaveLength(1);
    expect(wire?.sent.at(-1)).toContain('New conversation');
    expect(wire?.sent.at(-1)).not.toContain('This chat so far');
    await desk.stop();
    expect(wire?.sent).toContain('close');
    wire?.events.closed('closed', 1000);
    expect(wires).toHaveLength(1);
  });

  it('gives the winner of a wake contest the session its superseded loser released', async () => {
    const desk = deskOf();
    const loser = await hostedCall(desk, 'loser');
    await loser.end('replaced');
    await hostedCall(desk, 'winner');
    expect(wires).toHaveLength(1);
    await desk.stop();
  });

  it('opens a separate session for a second call that runs at the same time', async () => {
    const desk = deskOf();
    await hostedCall(desk, 'first');
    const second = await hostedCall(desk, 'second');
    expect(wires).toHaveLength(2);
    await second.end('hung_up');
    expect(wires[1]?.sent).toContain('close');
    expect(wires[0]?.sent).not.toContain('close');
    await desk.stop();
  });
});
