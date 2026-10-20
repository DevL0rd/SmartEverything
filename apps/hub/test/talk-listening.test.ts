import { systemClock } from '../src/clock';
import { readFileSync } from 'node:fs';
import {
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
import type { RemoteEar, RemoteEarOptions } from '../src/listening/remote-ears-port';
import type { SpeechSegment } from '../src/listening/speech-segment';
import { TalkListening, type TalkHeard } from '../src/talk/talk-listening';
import { talkContext, talkWakeText } from '../src/talk/talk-wake-text';
import type { PacketSink, TalkEndpoint } from '../src/talk/transmission';
import { Transmissions } from '../src/talk/transmissions';
import type {
  TranscriptionAnswer,
  TranscriptionInput,
  TranscriptionProvider,
} from '../src/openrouter/transcription';
import type { Superseded, WakeClaim } from '../src/wake-name/wake-claims';
import { Transcriber } from '../src/transcripts/transcriber';
import { FakeClock } from './support/fake-clock';
import { testLogger } from './support/logs';
import { testStore, type TestStore } from './support/store';

const START = '2026-10-08T10:00:00.000Z';
const FRAME_48K = 960;

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

class FakeProvider implements TranscriptionProvider {
  readonly inputs: TranscriptionInput[] = [];

  transcribe(input: TranscriptionInput): Promise<TranscriptionAnswer> {
    this.inputs.push(input);
    return Promise.resolve({
      text: ' hey jarvis turn on the lights ',
      usage: { seconds: 3, input_tokens: 100, cost: 0.001 },
    });
  }
}

interface Heard {
  readonly options: RemoteEarOptions;
  readonly packets: Uint8Array[];
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
let clock: FakeClock;
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

function segment(startedAt: number, pcm: Int16Array = voice()): SpeechSegment {
  return { startedAt, endedAt: startedAt + pcm.length / 16, pcm };
}

const WAV_HEADER_BYTES = 44;

function wavBytes(samples: number): number {
  return WAV_HEADER_BYTES + samples * 2;
}

function tone(samples: number): Int16Array {
  return Int16Array.from({ length: samples }, (_, index) => Math.round(8000 * Math.sin(index / 5)));
}

async function speak(
  sink: PacketSink,
  segments: readonly SpeechSegment[] = [segment(0)],
): Promise<void> {
  await settled();
  segments.forEach((spoken) => {
    ears[0]?.options.speech?.(spoken);
  });
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
  clock = new FakeClock(START);
  listening = new TalkListening({
    store: test.store,
    ears: {
      open: (options): Promise<RemoteEar> => {
        const ear: Heard = { options, packets: [], closed: false };
        ears.push(ear);
        return Promise.resolve({
          packet: (packet): void => {
            ear.packets.push(packet);
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
      log: testLogger('transcriber'),
    }),
    budget: { capReached: (): boolean => false },
    names: (): string[] => ['Jarvis'],
    keyPresent: (): boolean => keyPresent,
    clock,
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
    expect(ears[0]?.options.source).toEqual({ kind: 'talk', key: messageId });
    expect(ears[0]?.options.codec).toBe('opus_48k_mono');
    ears[0]?.options.wake?.(
      'hey jarvis',
      () => new Int16Array(),
      () => undefined,
    );
    await speak(sink);
    expect(ears[0]?.closed).toBe(true);
    expect(ears[0]?.packets).toHaveLength(opusPackets(voice()).length);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({
      messageId,
      phrase: 'hey jarvis',
      transcript: 'hey jarvis turn on the lights',
    });
  });

  it('sends the pieces of one message with short pauses as one transcription', async () => {
    const messageId = startMessage(channel);
    const first = segment(0, tone(16_000));
    const second = segment(first.endedAt + 300, tone(16_000));
    const lastWord = segment(second.endedAt + 300, tone(4800));
    await speak(listening.open(channel, messageId, speaker), [first, second, lastWord]);
    expect(provider.inputs).toHaveLength(1);
    const seams = 2 * 4000;
    expect(provider.inputs[0]?.data.length).toBe(
      wavBytes(first.pcm.length + second.pcm.length + lastWord.pcm.length + seams),
    );
    expect(test.store.talk.message(messageId).transcript).toBe('hey jarvis turn on the lights');
  });

  it('keeps a short last word that is too short to be heard alone', async () => {
    const messageId = startMessage(channel);
    const first = segment(0, tone(24_000));
    const word = segment(first.endedAt + 300, tone(4800));
    await speak(listening.open(channel, messageId, speaker), [first, word]);
    expect(provider.inputs).toHaveLength(1);
    expect(provider.inputs[0]?.data.length).toBe(wavBytes(24_000 + 4000 + 4800));
  });

  it('transcribes pieces far apart separately and joins their texts in order', async () => {
    const messageId = startMessage(channel);
    const first = segment(0);
    const second = segment(first.endedAt + 5000);
    await speak(listening.open(channel, messageId, speaker), [first, second]);
    expect(provider.inputs).toHaveLength(2);
    expect(test.store.talk.message(messageId).transcript).toBe(
      'hey jarvis turn on the lights hey jarvis turn on the lights',
    );
  });

  it('does not run the turn of a wake that was superseded', async () => {
    const sink = listening.open(channel, startMessage(channel), speaker);
    await settled();
    const stops: Superseded[] = [];
    ears[0]?.options.wake?.(
      'hey jarvis',
      () => new Int16Array(),
      (registered) => {
        stops.push(registered);
      },
    );
    const winner: WakeClaim = { source: 'voice_call', key: 'guild', snippetDbfs: -10 };
    stops.forEach((stop) => {
      stop(winner);
    });
    await speak(sink);
    expect(heard).toHaveLength(0);
  });

  it('hands a late stop to the turn so its pending reply can be dropped', async () => {
    const sink = listening.open(channel, startMessage(channel), speaker);
    await settled();
    const stops: Superseded[] = [];
    ears[0]?.options.wake?.(
      'hey jarvis',
      () => new Int16Array(),
      (registered) => {
        stops.push(registered);
      },
    );
    await speak(sink);
    const dropped: string[] = [];
    heard[0]?.onSuperseded((winner) => {
      dropped.push(winner.source);
    });
    stops.forEach((stop) => {
      stop({ source: 'voice_call', key: 'guild', snippetDbfs: -10 });
    });
    expect(dropped).toEqual(['voice_call']);
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
        go2rtc: {
          play: (): Promise<void> => Promise.resolve(),
          backchannel: (): Promise<boolean> => Promise.resolve(true),
        },
        feeds: new TalkFeeds(log),
        ready,
        clock: systemClock,
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
