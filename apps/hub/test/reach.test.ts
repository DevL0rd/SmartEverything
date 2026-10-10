import {
  DEFAULT_ENGINE,
  type AiOutreachRow,
  type AiSpeechNotice,
  type ClientRow,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Saying, SpeechRequest } from '../src/speech/one-shot-speech';
import type { HostedCall, HostedCallRequest } from '../src/assistant-voice/outreach';
import type { CameraParts } from '../src/reach/camera-conversation';
import { CameraFraming } from '../src/reach/camera-framing';
import { ReachRefusedError } from '../src/reach/reach-errors';
import type { Asker } from '../src/reach/reach-guards';
import { ReachRules, insideQuiet } from '../src/reach/reach-rules';
import { ReachService } from '../src/reach/reach-service';
import type { PushCommandOutcome } from '../src/extensions/push/commands';
import { ringTransports } from '../src/reach/ring-transports';
import type { RingTransport } from '../src/reach/ringing';
import { CameraMicrophones } from '../src/talk/camera-microphone';
import { CameraSpeakers } from '../src/talk/camera-speaker';
import { TalkFeeds } from '../src/talk/feeds';
import type { LiveOpening } from '../src/talk/relay';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const START = '2026-10-08T10:00:00.000Z';

interface Bench {
  readonly opened: TestStore;
  readonly clock: FakeClock;
  readonly service: ReachService;
  readonly rules: ReachRules;
  readonly asker: Asker;
  readonly phone: ClientRow;
  readonly turns: { chatId: string; text: string }[];
  readonly rang: AiOutreachRow[];
  readonly cancelled: string[];
  readonly hosted: HostedCallRequest[];
  readonly announced: SpeechRequest[];
  readonly delivered: AiSpeechNotice[];
  reachable: boolean;
  stuck: boolean;
}

function transport(
  bench: Pick<Bench, 'rang' | 'cancelled'>,
  clients: () => ClientRow[],
): RingTransport {
  return {
    targets: (): ClientRow[] => clients(),
    ring: (row): Promise<string | null> => {
      bench.rang.push(row);
      return Promise.resolve(null);
    },
    cancel: (row): void => {
      bench.cancelled.push(row.id);
    },
    unreachable: (): string => 'Can’t reach them.',
  };
}

function idleCamera(): CameraParts {
  const log = testLogger('reach-camera');
  const ready = (): Promise<void> => Promise.resolve();
  return {
    speakers: new CameraSpeakers({
      go2rtc: { play: (): Promise<void> => Promise.resolve() },
      feeds: new TalkFeeds(log),
      ready,
      log,
    }),
    microphones: new CameraMicrophones({ rtspPort: 0, ready, log }),
  };
}

async function bench(): Promise<Bench> {
  const opened = await testStore();
  const { store } = opened;
  const clock = new FakeClock(START);
  const profileId = store.profiles.first().id;
  const chat = store.aiChats.create({
    profileId,
    kind: 'chat',
    title: 'Home',
    icon: null,
    parentId: null,
    sourceKey: null,
    engine: DEFAULT_ENGINE,
  });
  const phone = store.clients.create({
    name: 'Pixel',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  const parts: Omit<Bench, 'opened' | 'clock' | 'service' | 'rules' | 'asker' | 'phone'> = {
    rang: [],
    cancelled: [],
    turns: [],
    hosted: [],
    announced: [],
    delivered: [],
    reachable: true,
    stuck: false,
  };
  const rules = new ReachRules(store, clock.now);
  const ring = transport(parts, () => [phone]);
  const service = new ReachService({
    store,
    rules,
    assistant: {
      conversationChat: (): string => chat.id,
      turn: (chatId, text): void => {
        parts.turns.push({ chatId, text });
      },
      message: (): Promise<string> => Promise.resolve(chat.id),
      aiName: (): string => 'Coordinator',
      liveVideo: (): boolean => false,
      muteMic: (): boolean => false,
    },
    transports: { phone: ring, desktop: transport(parts, () => []) },
    host: (request): Promise<HostedCall> => {
      parts.hosted.push(request);
      return Promise.resolve({ hear: () => undefined, end: () => Promise.resolve() });
    },
    say: (request): Promise<Saying> => {
      parts.announced.push(request);
      if (parts.stuck) {
        request.sink.ended('failed', 'Gemini closed the connection.');
        return new Promise<Saying>(() => undefined);
      }
      return Promise.resolve({ end: () => Promise.resolve() });
    },
    app: {
      refusal: (): null => null,
      play: (_client, notice): Promise<string | null> => {
        parts.delivered.push(notice);
        return Promise.resolve(parts.reachable ? null : 'The app is gone.');
      },
    },
    camera: idleCamera(),
    framing: new CameraFraming({
      store,
      submit: (): void => undefined,
      clock,
      log: testLogger('reach-framing'),
    }),
    openLive: (): LiveOpening => ({ ok: false, reason: 'channel_busy' }),
    clock,
    log: testLogger('reach'),
  });
  return Object.assign(parts, {
    opened,
    clock,
    service,
    rules,
    phone,
    asker: { profileId, role: 'owner' as const, clientId: phone.id, chatId: chat.id },
  });
}

let current: Bench;

beforeEach(async () => {
  current = await bench();
});

afterEach(async () => {
  current.service.stop();
  await current.opened.close();
});

function callMe(urgent = false): Promise<AiOutreachRow> {
  return current.service.call(current.asker, {
    personId: current.asker.profileId,
    device: 'phone',
    reason: 'The baby is crying',
    urgent,
  });
}

describe('call_person', () => {
  it('rings, and answering in the right chat makes it live with the reason as the opening', async () => {
    const row = await callMe();
    expect(row.state).toBe('ringing');
    expect(current.rang).toHaveLength(1);
    const answer = current.service.answered({
      outreachId: row.id,
      callId: '1d000000-0000-4000-8000-000000000001',
      clientId: current.phone.id,
      chatId: row.chat_id ?? '',
    });
    expect(answer.kind).toBe('answer');
    expect(answer.kind === 'answer' ? answer.opening : '').toContain('The baby is crying');
    expect(current.opened.store.aiOutreach.byId(row.id).state).toBe('live');
  });

  it('refuses an answer from another chat', async () => {
    const row = await callMe();
    const answer = current.service.answered({
      outreachId: row.id,
      callId: '1d000000-0000-4000-8000-000000000001',
      clientId: current.phone.id,
      chatId: '1d000000-0000-4000-8000-000000000002',
    });
    expect(answer.kind).toBe('refused');
  });

  it('turns missed after 45 seconds, cancels the ring and tells the calling chat', async () => {
    const row = await callMe();
    current.clock.advanceTo('2026-10-08T10:00:46.000Z');
    expect(current.opened.store.aiOutreach.byId(row.id).state).toBe('missed');
    expect(current.cancelled).toEqual([row.id]);
    expect(current.turns[0]?.text).toContain('was not answered');
  });

  it('does not report back when a call in the same chat ended normally', async () => {
    const row = await callMe();
    current.service.answered({
      outreachId: row.id,
      callId: '1d000000-0000-4000-8000-000000000001',
      clientId: current.phone.id,
      chatId: row.chat_id ?? '',
    });
    current.service.ended(row.id, 'finished', 'Person: thanks');
    expect(current.opened.store.aiOutreach.byId(row.id).state).toBe('ended');
    expect(current.turns).toHaveLength(0);
  });

  it('respects quiet hours and lets urgent through only when allowed', async () => {
    current.rules.save(current.asker.profileId, {
      quiet: { from: '09:00', to: '11:00', urgent: true },
    });
    await expect(callMe()).rejects.toBeInstanceOf(ReachRefusedError);
    await expect(callMe(true)).resolves.toMatchObject({ state: 'ringing' });
  });

  it('refuses after six outreaches in ten minutes', async () => {
    for (let index = 0; index < 6; index++) {
      await callMe();
    }
    await expect(callMe()).rejects.toThrow(/6 times/);
  });
});

const NOWHERE = '1d000000-0000-4000-8000-000000000009';

const OPUS_FRAME = new Uint8Array([0xf8, 0xff, 0xfe]);

function spoken(index = 0): SpeechRequest {
  const request = current.announced[index];
  if (request === undefined) {
    throw new Error('Nothing was announced.');
  }
  return request;
}

describe('speak', () => {
  it('plays on an app by sending it the audio, with no chat and no turn', async () => {
    const row = await current.service.speak(current.asker, {
      target: { kind: 'device', deviceId: current.phone.id },
      text: 'Dinner is ready',
    });
    expect(row).toMatchObject({ how: 'app', chat_id: null, state: 'live' });
    expect(spoken().text).toBe('Dinner is ready');
    spoken().sink.audio(OPUS_FRAME);
    spoken().sink.said();
    await vi.waitFor(() => {
      expect(current.opened.store.aiOutreach.byId(row.id).state).toBe('sent');
    });
    expect(current.delivered[0]).toMatchObject({ type: 'ai_speech', text: 'Dinner is ready' });
    expect(current.turns).toHaveLength(0);
  });

  it('fails visibly when the app went away before it could play', async () => {
    current.reachable = false;
    const row = await current.service.speak(current.asker, {
      target: { kind: 'device', deviceId: current.phone.id },
      text: 'Hello',
    });
    spoken().sink.said();
    await vi.waitFor(() => {
      expect(current.opened.store.aiOutreach.byId(row.id)).toMatchObject({ state: 'failed' });
    });
  });

  it('answers with the failure when the voice service never opens', async () => {
    current.stuck = true;
    await expect(
      current.service.speak(current.asker, {
        target: { kind: 'device', deviceId: current.phone.id },
        text: 'Hello',
      }),
    ).rejects.toThrow(/voice service stopped \(Gemini closed/);
  });

  it('tells the asking chat when the voice service fails after the call returned', async () => {
    await current.service.speak(current.asker, {
      target: { kind: 'device', deviceId: current.phone.id },
      text: 'Hello',
    });
    spoken().sink.ended('failed', 'Voice Nope is not valid for speech');
    await vi.waitFor(() => {
      expect(current.turns[0]?.text).toContain('Voice Nope is not valid for speech');
    });
  });

  it('refuses an unknown device without speaking', async () => {
    await expect(
      current.service.speak(current.asker, {
        target: { kind: 'device', deviceId: NOWHERE },
        text: 'Hello',
      }),
    ).rejects.toThrow(/No camera or app has that id/);
    expect(current.announced).toHaveLength(0);
  });
});

describe('start_conversation and call', () => {
  it('rings only the app it was asked to', async () => {
    const row = await current.service.startConversation(current.asker, {
      target: { kind: 'device', deviceId: current.phone.id },
      reason: 'Quick question',
      urgent: false,
    });
    expect(row).toMatchObject({ how: 'phone', state: 'ringing', clients: [current.phone.id] });
  });

  it('call any rings every reachable app and records which', async () => {
    const row = await current.service.call(current.asker, {
      personId: current.asker.profileId,
      device: 'any',
      reason: 'Hello',
      urgent: false,
    });
    expect(row).toMatchObject({ how: 'app', clients: [current.phone.id] });
  });

  it('hang_up stops a ringing call', async () => {
    const row = await callMe();
    await expect(current.service.hangUp(row.id)).resolves.toMatchObject({ state: 'ended' });
  });

  it('refuses an unknown camera without starting anything', async () => {
    await expect(
      current.service.startConversation(current.asker, {
        target: { kind: 'device', deviceId: NOWHERE },
        reason: 'Say hello',
        urgent: false,
      }),
    ).rejects.toThrow(/No camera or app has that id/);
    expect(current.hosted).toHaveLength(0);
  });
});

describe('quiet hours', () => {
  it('handles overnight spans', () => {
    const quiet = { from: '22:00', to: '07:00', urgent: false };
    expect(insideQuiet(quiet, 23 * 60)).toBe(true);
    expect(insideQuiet(quiet, 6 * 60)).toBe(true);
    expect(insideQuiet(quiet, 12 * 60)).toBe(false);
  });
});

describe('phone transport', () => {
  function phoneTransport(
    online: ReadonlySet<string>,
    configured: boolean,
    sent: string[],
  ): RingTransport {
    return ringTransports({
      store: current.opened.store,
      online: () => online,
      push: {
        send: (request): Promise<PushCommandOutcome> => {
          sent.push(request.clientId);
          return Promise.resolve({ outcome: 'sent' });
        },
      },
      pushConfigured: () => configured,
      aiName: () => 'Coordinator',
      log: testLogger('reach-phone'),
    }).phone;
  }

  it('rings a connected phone over the live connection without push', async () => {
    const sent: string[] = [];
    const phone = phoneTransport(new Set([current.phone.id]), false, sent);
    const targets = phone.targets(current.asker.profileId);
    expect(targets.map((client) => client.id)).toEqual([current.phone.id]);
    const row = await callMe();
    await expect(phone.ring(row, targets)).resolves.toBeNull();
    expect(sent).toHaveLength(0);
  });

  it('says push is not set up when the phone app is not connected', () => {
    const phone = phoneTransport(new Set(), false, []);
    expect(phone.targets(current.asker.profileId)).toHaveLength(0);
    expect(phone.unreachable(current.asker.profileId, 'Me')).toContain(
      "push notifications aren't set up",
    );
  });

  it('says to open the app once when push is set up but the phone never signed up', () => {
    const phone = phoneTransport(new Set(), true, []);
    expect(phone.unreachable(current.asker.profileId, 'Me')).toContain('open SmartEverything');
  });
});
