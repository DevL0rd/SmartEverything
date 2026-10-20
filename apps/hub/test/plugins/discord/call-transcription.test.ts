import { describe, expect, it } from 'vitest';
import { Opus } from '../../../src/assistant-voice/opus';
import { OPUS_SILENCE } from '../../../src/reach/voice-pacing';
import { person } from '../../../src/plugins/builtin/discord/person';
import { CallSession } from '../../../src/plugins/builtin/discord/voice/call-session';
import type { VoiceLink } from '../../../src/plugins/builtin/discord/voice/link';
import type { PluginVoice } from '../../../src/plugins/plugin-voice';
import type { SpeechSegment } from '../../../src/listening/speech-segment';
import { FakeClock } from '../../support/fake-clock';

type EarRequest = Parameters<PluginVoice['ear']>[0];

const START = '2026-10-17T10:00:00.000Z';
const BASE = Date.parse(START);
const SAMPLES_PER_MS = 16;
const nothing = (): void => undefined;

function tone(ms: number, decibels: number): Int16Array {
  const amplitude = 32_768 * 10 ** (decibels / 20) * Math.SQRT2;
  return Int16Array.from({ length: ms * SAMPLES_PER_MS }, (_, index) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * 220 * index) / 16_000)),
  );
}

function packets(count: number): Uint8Array[] {
  const codec = new Opus(48_000, 2);
  const frame = Int16Array.from({ length: 1920 }, (_, index) =>
    Math.round(8000 * Math.sin((2 * Math.PI * 220 * Math.floor(index / 2)) / 48_000)),
  );
  const made = Array.from({ length: count }, () => Uint8Array.from(codec.encode(frame, 960)));
  codec.free();
  return made;
}

async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

interface Rig {
  readonly clock: FakeClock;
  readonly session: CallSession;
  readonly requests: EarRequest[];
  readonly heard: Uint8Array[];
  readonly mixed: string[];
  readonly transcribed: { at: number; samples: number }[];
  readonly lines: string[];
  readonly silences: number[];
  release: () => void;
  speak: (userId: string, count: number) => Promise<void>;
  segment: (userId: string, atMs: number, ms: number, decibels?: number) => void;
}

interface RigOptions {
  readonly approved?: (userId: string) => boolean;
  readonly wakeable?: () => boolean;
  readonly slow?: boolean;
  readonly closingMs?: number;
}

function rig(options: RigOptions): Rig {
  const clock = new FakeClock(START);
  const requests: EarRequest[] = [];
  const heard: Uint8Array[] = [];
  const mixed: string[] = [];
  const transcribed: { at: number; samples: number }[] = [];
  const lines: string[] = [];
  const silences: number[] = [];
  let release = nothing;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let speaking: (userId: string) => void = nothing;
  let streams = new Map<string, Uint8Array[]>();
  const link: VoiceLink = {
    channelId: 'channel',
    muted: () => false,
    setMuted: () => false,
    onSpeaking: (listener): void => {
      speaking = listener;
    },
    listen: (userId, silenceMs): AsyncIterable<Uint8Array> => {
      silences.push(silenceMs);
      const queued = streams.get(userId) ?? [];
      streams.delete(userId);
      return (async function* (): AsyncGenerator<Uint8Array> {
        await Promise.resolve();
        yield* queued;
      })();
    },
    play: nothing,
    stop: nothing,
    onClosed: nothing,
    destroy: nothing,
  };
  const session = new CallSession({
    identity: { guildId: 'guild', channelId: 'channel', channelName: 'Lounge', startedAt: START },
    link,
    transcript: {
      id: 'transcript',
      add: (line): void => {
        lines.push(line.text);
      },
      recent: (): never[] => [],
      close: nothing,
    },
    voice: {
      ear: (
        request,
      ): Promise<{ packet: (opus: Uint8Array) => void; close: () => Promise<void> }> => {
        requests.push(request);
        return Promise.resolve({
          packet: (opus): void => {
            heard.push(opus);
          },
          close: (): Promise<void> => {
            if (options.closingMs !== undefined) {
              const startedAt = clock.now().getTime();
              request.speech?.({
                startedAt,
                endedAt: startedAt + options.closingMs,
                pcm: tone(options.closingMs, -15),
              });
            }
            return Promise.resolve();
          },
        });
      },
      transcribe: (request): Promise<string> => {
        transcribed.push({ at: clock.now().getTime(), samples: request.pcm16k.length });
        const text = `line ${String(transcribed.length)}`;
        return (options.slow === true ? released : Promise.resolve()).then(() => text);
      },
    },
    language: 'en',
    hooks: {
      approved: options.approved ?? ((): boolean => true),
      captures: (): boolean => true,
      mixes: (userId): void => {
        mixed.push(userId);
      },
      wakeable: options.wakeable ?? ((): boolean => true),
      wakeSensitivity: (): 'standard' => 'standard',
      wakeNames: (): string[] => [],
      wake: nothing,
      heard: nothing,
      speaker: (userId): Promise<ReturnType<typeof person>> =>
        Promise.resolve(person(userId, userId)),
      names: (): string[] => [],
      report: (cause): void => {
        throw cause instanceof Error ? cause : new Error('reported');
      },
      changed: nothing,
    },
    clock,
  });
  session.start();
  return {
    clock,
    session,
    requests,
    heard,
    mixed,
    transcribed,
    lines,
    silences,
    release: (): void => {
      release();
    },
    speak: async (userId, count): Promise<void> => {
      streams = streams.set(userId, packets(count));
      speaking(userId);
      await settle();
    },
    segment: (userId, atMs, ms, decibels = -15): void => {
      clock.advanceTo(new Date(BASE + atMs + ms).toISOString());
      const segment: SpeechSegment = {
        startedAt: BASE + atMs,
        endedAt: BASE + atMs + ms,
        pcm: tone(ms, decibels),
      };
      requests.find((request) => request.speaker === userId)?.speech?.(segment);
    },
  };
}

describe('Discord transcription through the shared gate', () => {
  it('feeds every captured user to the ear but mixes and wakes only approved ones', async () => {
    let wakeable = true;
    const harness = rig({ approved: (userId) => userId === 'ann', wakeable: () => wakeable });
    await harness.speak('ann', 3);
    await harness.speak('bob', 3);
    expect(harness.requests.map((request) => request.speaker)).toEqual(['ann', 'bob']);
    expect(harness.mixed).toEqual(['ann', 'ann', 'ann']);
    const [ann, bob] = harness.requests;
    expect(ann?.wakes?.()).toBe(true);
    expect(bob?.wakes?.()).toBe(false);
    wakeable = false;
    expect(ann?.wakes?.()).toBe(false);
  });

  it('hands the ear the received Opus packets as they came, in stereo', async () => {
    const harness = rig({});
    await harness.speak('ann', 3);
    expect(harness.requests.map((request) => request.codec)).toEqual(['opus_48k_stereo']);
    expect(harness.heard.slice(0, 3)).toEqual(packets(3));
  });

  it('pads a second of Opus silence into the ear when the stream ends so the gate closes at once', async () => {
    const harness = rig({});
    await harness.speak('ann', 2);
    const padding = harness.heard.slice(2);
    expect(padding).toHaveLength(50);
    expect(padding.every((packet) => packet === OPUS_SILENCE)).toBe(true);
  });

  it('decodes only the approved speakers for the mix', async () => {
    const harness = rig({ approved: (userId) => userId === 'ann' });
    await harness.speak('bob', 3);
    expect(harness.mixed).toEqual([]);
    expect(harness.heard.slice(0, 3)).toHaveLength(3);
  });

  it('hands the utterance to transcription 2.5 s after the segment ends', async () => {
    const harness = rig({});
    await harness.speak('ann', 2);
    harness.segment('ann', 0, 3000);
    harness.clock.advanceTo(new Date(BASE + 3000 + 2499).toISOString());
    await settle();
    expect(harness.transcribed).toHaveLength(0);
    harness.clock.advanceTo(new Date(BASE + 3000 + 2500).toISOString());
    await settle();
    expect(harness.lines).toEqual(['line 1']);
    expect(harness.transcribed[0]?.at).toBe(BASE + 3000 + 2500);
  });

  it('writes the line within 5 s of the last sound, counting the capture end and the hold', async () => {
    const harness = rig({});
    await harness.speak('ann', 2);
    const [captureEndMs = 0] = harness.silences;
    expect(captureEndMs).toBeGreaterThan(0);
    const lastSoundAt = BASE + 3000;
    harness.segment('ann', 0, 3000 + captureEndMs);
    const handoffAt = lastSoundAt + captureEndMs + 2500;
    harness.clock.advanceTo(new Date(handoffAt - 1).toISOString());
    await settle();
    expect(harness.transcribed).toHaveLength(0);
    harness.clock.advanceTo(new Date(handoffAt).toISOString());
    await settle();
    expect(harness.lines).toEqual(['line 1']);
    expect(harness.transcribed[0]?.at).toBe(handoffAt);
    expect(handoffAt - lastSoundAt).toBeLessThanOrEqual(5000);
  });

  it('keeps every utterance when transcription falls behind', async () => {
    const harness = rig({ slow: true });
    await harness.speak('ann', 2);
    for (let index = 0; index < 20; index++) {
      harness.segment('ann', index * 6000, 1000);
    }
    harness.clock.advanceTo(new Date(BASE + 20 * 6000 + 3000).toISOString());
    await settle();
    expect(harness.session.counts().pending).toBe(18);
    harness.release();
    await settle();
    expect(harness.lines).toHaveLength(20);
    expect(harness.session.counts().pending).toBe(0);
  });

  it('joins a conversation with short pauses and never flushes by length alone', async () => {
    const harness = rig({});
    await harness.speak('ann', 2000);
    await settle();
    expect(harness.transcribed).toHaveLength(0);
    harness.segment('ann', 0, 1500);
    harness.segment('ann', 2500, 1200);
    harness.clock.advanceTo(new Date(BASE + 3700 + 2500).toISOString());
    await settle();
    expect(harness.transcribed).toHaveLength(1);
    expect(harness.transcribed[0]?.samples).toBeGreaterThan(2700 * SAMPLES_PER_MS);
  });

  it('splits at a pause longer than the hold and keeps users apart', async () => {
    const harness = rig({});
    await harness.speak('ann', 2);
    await harness.speak('bob', 2);
    harness.segment('ann', 0, 1000);
    harness.segment('bob', 1200, 1000);
    harness.segment('ann', 6000, 1000);
    harness.clock.advanceTo(new Date(BASE + 12_000).toISOString());
    await settle();
    expect(harness.transcribed).toHaveLength(3);
  });

  it('writes nothing for quiet noise the gate let through', async () => {
    const harness = rig({});
    await harness.speak('ann', 2);
    harness.segment('ann', 0, 2000, -45);
    harness.clock.advanceTo(new Date(BASE + 10_000).toISOString());
    await settle();
    expect(harness.transcribed).toHaveLength(0);
    expect(harness.session.counts().skipped).toBe(1);
  });

  it('writes the last segment of a user whose ear is dropped', async () => {
    const harness = rig({ closingMs: 1000 });
    await harness.speak('ann', 2);
    harness.session.dropEar('ann');
    await settle();
    expect(harness.transcribed).toHaveLength(1);
    expect(harness.lines).toEqual(['line 1']);
    expect(harness.clock.pending()).toEqual([]);
  });

  it('leaves no joiner or timer behind when the call closes with an ear still delivering', async () => {
    const harness = rig({ closingMs: 1000 });
    await harness.speak('ann', 2);
    await harness.session.close();
    await settle();
    expect(harness.transcribed).toHaveLength(0);
    expect(harness.clock.pending()).toEqual([]);
  });

  it('drops a pending utterance when the call closes', async () => {
    const harness = rig({});
    await harness.speak('ann', 2);
    harness.segment('ann', 0, 2000);
    await harness.session.close();
    harness.clock.advanceTo(new Date(BASE + 10_000).toISOString());
    await settle();
    expect(harness.transcribed).toHaveLength(0);
  });
});
