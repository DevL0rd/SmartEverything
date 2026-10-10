import { readFileSync } from 'node:fs';
import {
  NO_PRICES,
  TALK_NEW_CHANNEL,
  type AiUsageRow,
  type TalkChannelRow,
  type TalkSpeaker,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { opusCodec } from '../src/assistant-voice/audio';
import { CameraMicrophones } from '../src/talk/camera-microphone';
import { CameraSpeakers } from '../src/talk/camera-speaker';
import { TalkFeeds } from '../src/talk/feeds';
import { TalkMembership } from '../src/talk/membership';
import { TalkRecorder } from '../src/talk/recorder';
import { TalkListening, type Listener, type TalkHeard } from '../src/talk/talk-listening';
import { talkContext, talkWakeText } from '../src/talk/talk-wake-text';
import type { PacketSink, TalkEndpoint } from '../src/talk/transmission';
import { Transmissions } from '../src/talk/transmissions';
import { Transcriber, type TranscriptionInput } from '../src/transcripts/transcriber';
import type { EarOptions } from '../src/wake-name/ear';
import { WakeClaims, STAND_DOWN_GRACE_MS } from '../src/wake-name/wake-claims';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const START = '2026-10-08T10:00:00.000Z';
const FRAME_48K = 960;
const PRICING = { ...NO_PRICES, input_per_mtok: 1, output_per_mtok: 2, audio_in_per_mtok: 3 };

function voice(): Int16Array {
  const bytes = readFileSync(new URL('assistant/fixtures/hw_us1.pcm', import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function opusPackets(pcm16k: Int16Array): Uint8Array[] {
  const codec = opusCodec();
  const up = Int16Array.from(
    { length: pcm16k.length * 3 },
    (_, index) => pcm16k[Math.floor(index / 3)] ?? 0,
  );
  const packets: Uint8Array[] = [];
  for (let offset = 0; offset + FRAME_48K <= up.length; offset += FRAME_48K) {
    packets.push(codec.encode(up.slice(offset, offset + FRAME_48K)));
  }
  codec.free();
  return packets;
}

function settled(): Promise<void> {
  return new Promise((done) => {
    setTimeout(done, 20);
  });
}

class FakeProvider {
  readonly inputs: TranscriptionInput[] = [];

  transcribe(
    input: TranscriptionInput,
  ): Promise<{ text: string; usage: { promptTokenCount: number } }> {
    this.inputs.push(input);
    return Promise.resolve({
      text: ' hey jarvis turn on the lights ',
      usage: { promptTokenCount: 100 },
    });
  }
}

interface Heard {
  readonly options: EarOptions;
  readonly pcm: Int16Array[];
  closed: boolean;
}

let test: TestStore;
let provider: FakeProvider;
let ears: Heard[];
let heard: TalkHeard[];
let booked: AiUsageRow[];
let channel: TalkChannelRow;
let keyPresent: boolean;
let ownerClient: string;
let listening: TalkListening;
const speaker: TalkSpeaker = {
  kind: 'client',
  id: crypto.randomUUID(),
  label: 'Pixel',
  detail: null,
};

function newChannel(aiListens: boolean): TalkChannelRow {
  const { members, ...input } = TALK_NEW_CHANNEL.parse({ name: 'Garage', ai_listens: aiListens });
  expect(members).toEqual([]);
  return test.store.talk.createChannel(input);
}

function startMessage(row: TalkChannelRow): string {
  const id = crypto.randomUUID();
  test.store.talk.startMessage({
    id,
    channel_id: row.id,
    speaker_kind: speaker.kind,
    speaker_id: speaker.id,
    speaker_label: speaker.label,
    speaker_detail: speaker.detail,
    kind: 'talk',
    started_at: START,
  });
  return id;
}

async function speak(sink: PacketSink): Promise<void> {
  opusPackets(voice()).forEach((packet) => {
    sink.packet(packet);
  });
  sink.end();
  await settled();
}

beforeEach(async () => {
  test = await testStore();
  ownerClient = test.store.clients.create(
    { name: 'Pixel', platform: 'android', role: 'owner', tokenHash: 'a'.repeat(64) },
    true,
  ).id;
  provider = new FakeProvider();
  ears = [];
  heard = [];
  booked = [];
  keyPresent = true;
  test.store.ledger.on((row): void => {
    booked.push(row);
  });
  const clock = new FakeClock(START);
  listening = new TalkListening({
    store: test.store,
    ears: {
      make: (options): Promise<Listener> => {
        const ear: Heard = { options, pcm: [], closed: false };
        ears.push(ear);
        return Promise.resolve({
          hear: (pcm): void => {
            ear.pcm.push(pcm);
          },
          close: (): Promise<void> => {
            ear.closed = true;
            return Promise.resolve();
          },
        });
      },
    },
    transcriber: new Transcriber({
      provider,
      ledger: test.store.ledger,
      prices: { priceOf: (): typeof PRICING => PRICING },
      log: testLogger('transcriber'),
    }),
    budget: { capReached: (): boolean => false },
    names: (): string[] => ['Jarvis'],
    keyPresent: (): boolean => keyPresent,
    now: clock.now,
    heard: (message): void => {
      heard.push(message);
    },
    log: testLogger('talk-listening'),
  });
  channel = newChannel(true);
});

afterEach(async () => {
  await test.close();
});

describe('AI listens setting', () => {
  it('is on for a new channel unless asked otherwise', () => {
    expect(channel.ai_listens).toBe(true);
    expect(TALK_NEW_CHANNEL.parse({ name: 'Kitchen' }).ai_listens).toBe(true);
  });

  it('is kept when turned off for one channel', () => {
    const off = test.store.talk.updateChannel(channel.id, { ai_listens: false });
    expect(off.ai_listens).toBe(false);
    expect(test.store.talk.channel(channel.id).ai_listens).toBe(false);
    expect(newChannel(false).ai_listens).toBe(false);
  });
});

describe('walkie-talkie transcripts', () => {
  it('stores the transcript of a message and books the cost in the ledger', async () => {
    const messageId = startMessage(channel);
    await speak(listening.open(channel, messageId, speaker));
    expect(test.store.talk.message(messageId).transcript).toBe('hey jarvis turn on the lights');
    expect(provider.inputs).toHaveLength(1);
    expect(booked).toHaveLength(1);
    expect(booked[0]?.work).toBe('transcribe');
    expect(booked[0]?.meta).toMatchObject({ listening: 'talk', channel_id: channel.id });
  });

  it('writes nothing and books nothing without a Gemini key', async () => {
    keyPresent = false;
    const messageId = startMessage(channel);
    await speak(listening.open(channel, messageId, speaker));
    expect(test.store.talk.message(messageId).transcript).toBeNull();
    expect(booked).toHaveLength(0);
  });

  it('hands the transcripts of a channel back oldest first within the window', () => {
    const first = startMessage(channel);
    const second = startMessage(channel);
    test.store.talk.setTranscript(first, 'one');
    test.store.talk.setTranscript(second, 'two');
    const rows = test.store.talk.recentTranscripts(channel.id, START, 5);
    expect(rows.map((row) => row.transcript)).toEqual(['one', 'two']);
  });
});

describe('the name heard on a walkie-talkie channel', () => {
  it('wakes the AI with the channel, speaker and transcript', async () => {
    const messageId = startMessage(channel);
    const sink = listening.open(channel, messageId, speaker);
    await settled();
    expect(ears[0]?.options.claim).toEqual({ source: 'talk', key: channel.id });
    ears[0]?.options.wake?.('hey jarvis', () => new Int16Array());
    await speak(sink);
    expect(ears[0]?.closed).toBe(true);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      messageId,
      phrase: 'hey jarvis',
      transcript: 'hey jarvis turn on the lights',
    });
  });

  it('does not wake the AI when the name was not heard', async () => {
    await speak(listening.open(channel, startMessage(channel), speaker));
    expect(heard).toHaveLength(0);
  });

  it('writes the wake turn with the earlier lines inside the context window', () => {
    const rows = [
      {
        ...test.store.talk.message(startMessage(channel)),
        transcript: 'old',
        started_at: '2026-10-08T08:00:00.000Z',
      },
      {
        ...test.store.talk.message(startMessage(channel)),
        transcript: 'recent',
        started_at: '2026-10-08T09:59:00.000Z',
      },
    ];
    const context = talkContext(rows, test.store.assistantChat.settings(), 'UTC', new Date(START));
    expect(context.join('\n')).toContain('recent');
    expect(context.join('\n')).not.toContain('old');
    const text = talkWakeText({
      channel,
      speaker: 'Pixel',
      phrase: 'hey jarvis',
      transcript: 'hey jarvis hi',
      context,
    });
    expect(text).toContain('Garage');
    expect(text).toContain('Earlier on this channel:');
  });
});

describe('wake priority', () => {
  let clock: FakeClock;
  let claims: WakeClaims;

  beforeEach(() => {
    clock = new FakeClock(START);
    claims = new WakeClaims({ clock, log: testLogger('claims') });
  });

  function lateIso(ms: number): string {
    return new Date(Date.parse(START) + ms).toISOString();
  }

  it('lets a camera wake when nobody else claimed the wake', async () => {
    const result = claims.request({ source: 'camera', key: 'cam' });
    clock.advanceTo(lateIso(STAND_DOWN_GRACE_MS));
    expect(await result).toBe(true);
  });

  it('makes a camera stand down when the name was heard on a walkie-talkie channel', async () => {
    expect(await claims.request({ source: 'talk', key: 'channel' })).toBe(true);
    const camera = claims.request({ source: 'camera', key: 'cam' });
    clock.advanceTo(lateIso(STAND_DOWN_GRACE_MS));
    expect(await camera).toBe(false);
  });

  it('makes a camera stand down when the same name was heard in a Discord voice call', async () => {
    expect(await claims.request({ source: 'voice_call', key: 'discord:person' })).toBe(true);
    const camera = claims.request({ source: 'camera', key: 'cam' });
    clock.advanceTo(lateIso(STAND_DOWN_GRACE_MS));
    expect(await camera).toBe(false);
  });

  it('makes a camera that heard first stand down for a claim that arrives within the grace', async () => {
    const camera = claims.request({ source: 'camera', key: 'cam' });
    expect(await claims.request({ source: 'talk', key: 'channel' })).toBe(true);
    clock.advanceTo(lateIso(STAND_DOWN_GRACE_MS));
    expect(await camera).toBe(false);
  });

  it('lets the camera wake again once the claim has run out', async () => {
    expect(await claims.request({ source: 'talk', key: 'channel' })).toBe(true);
    clock.advanceTo(lateIso(60_000));
    const camera = claims.request({ source: 'camera', key: 'cam' });
    clock.advanceTo(lateIso(60_000 + STAND_DOWN_GRACE_MS));
    expect(await camera).toBe(true);
  });
});

describe('which messages the AI listens to', () => {
  function transmissions(): Transmissions {
    const membership = new TalkMembership(test.store);
    const log = testLogger('talk');
    const ready = (): Promise<void> => Promise.resolve();
    return new Transmissions({
      store: test.store,
      membership,
      recorder: new TalkRecorder({
        store: test.store,
        dataDirectory: test.directory,
        now: () => new Date(START),
        log,
      }),
      speakers: new CameraSpeakers({
        go2rtc: { play: (): Promise<void> => Promise.resolve() },
        feeds: new TalkFeeds(log),
        ready,
        log,
      }),
      microphones: new CameraMicrophones({ rtspPort: 0, ready, log }),
      now: () => new Date(START),
      log,
    });
  }

  function endpoint(): TalkEndpoint {
    return {
      id: 'socket',
      clientId: ownerClient,
      send: (): void => undefined,
      audio: (): void => undefined,
    };
  }

  function attached(aiListens: boolean): { bench: Transmissions; opened: string[] } {
    const opened: string[] = [];
    test.store.talk.updateChannel(channel.id, { ai_listens: aiListens, keep_hours: 0 });
    const bench = transmissions();
    bench.attachListening({
      open: (row): PacketSink => {
        opened.push(row.id);
        return { packet: (): void => undefined, end: (): void => undefined };
      },
    });
    return { bench, opened };
  }

  it('opens a listener for a channel the AI listens to', () => {
    const { bench, opened } = attached(true);
    bench.talk(endpoint(), channel.id);
    expect(opened).toEqual([channel.id]);
  });

  it('opens no listener once the setting is off', () => {
    const { bench, opened } = attached(false);
    bench.talk(endpoint(), channel.id);
    expect(opened).toEqual([]);
  });
});
