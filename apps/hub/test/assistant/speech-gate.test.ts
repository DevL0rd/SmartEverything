import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BARGE_IN_LEVEL, SPEECH_DETECTION, SPEECH_PREROLL_MS } from '@smarteverything/domain';
import { sileroModel } from '../../src/assistant-voice/silero-vad';
import { SpeechGate } from '../../src/assistant-voice/speech-gate';

const CHUNK = 320;
const CHUNK_MS = 20;

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`fixtures/${name}.pcm`, import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function scaled(pcm: Int16Array, decibels: number): Int16Array {
  const gain = 10 ** (decibels / 20);
  return Int16Array.from(pcm, (sample) => Math.round(sample * gain));
}

function joined(...parts: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
  parts.reduce((offset, part) => {
    out.set(part, offset);
    return offset + part.length;
  }, 0);
  return out;
}

function mixed(a: Int16Array, b: Int16Array): Int16Array {
  return Int16Array.from({ length: Math.max(a.length, b.length) }, (_, index) =>
    Math.max(-32768, Math.min(32767, (a[index] ?? 0) + (b[index] ?? 0))),
  );
}

interface Heard {
  readonly first: number[];
  readonly events: string[];
  readonly sent: Int16Array;
}

async function listen(input: Int16Array, audibleUntilMs: number, level: number): Promise<Heard> {
  let at = 0;
  const events: string[] = [];
  const first: number[] = [];
  const sent: Int16Array[] = [];
  const gate = new SpeechGate(
    await sileroModel(),
    {
      start: (firstSample): void => {
        first.push(firstSample);
        events.push('start');
      },
      audio: (pcm): void => {
        sent.push(pcm);
      },
      end: (): void => {
        events.push('end');
      },
      failed: (reason): void => {
        events.push(`failed ${reason}`);
      },
    },
    {
      bargeInLevel: level,
      assistantAudible: (): boolean => at < audibleUntilMs,
      now: (): number => at,
    },
  );
  for (let offset = 0; offset < input.length; offset += CHUNK) {
    gate.hear(input.slice(offset, offset + CHUNK));
    at += CHUNK_MS;
    await new Promise((resolve) => setImmediate(resolve));
  }
  await gate.release();
  return { first, events, sent: joined(...sent) };
}

const silence = (ms: number): Int16Array => new Int16Array(16 * ms);

function containsExactly(input: Int16Array, part: Int16Array): boolean {
  for (let at = 0; at + part.length <= input.length; at++) {
    if (part.every((sample, index) => sample === input[at + index])) {
      return true;
    }
  }
  return false;
}

describe('SpeechGate on recorded fixtures', () => {
  const person = fixture('person');
  const assistant = fixture('ai');

  it('sends only the person, unchanged, with one start and one end', async () => {
    const input = joined(silence(1000), person, silence(2000));
    const heard = await listen(input, 0, BARGE_IN_LEVEL.echoCancelled);
    expect(heard.events).toEqual(['start', 'end']);
    const budget = person.length + 16 * (SPEECH_PREROLL_MS + SPEECH_DETECTION.redemptionMs + 64);
    expect(heard.sent.length).toBeLessThanOrEqual(budget);
    expect(containsExactly(input, heard.sent)).toBe(true);
  }, 30_000);

  it('reports where in the input the sent audio begins', async () => {
    const input = joined(silence(1000), person, silence(2000));
    const heard = await listen(input, 0, BARGE_IN_LEVEL.echoCancelled);
    const begin = heard.first[0] ?? Number.NaN;
    expect(begin).toBeGreaterThan(0);
    expect(input.subarray(begin, begin + heard.sent.length)).toEqual(heard.sent);
  }, 30_000);

  it('never sends the AI echo while it plays or during its tail', async () => {
    const heard = await listen(
      scaled(assistant, -10),
      assistant.length / 16,
      BARGE_IN_LEVEL.echoCancelled,
    );
    expect(heard.events).toEqual([]);
  }, 30_000);

  it('lets the person barge in over quieter echo, but not a whisper', async () => {
    const echo = scaled(assistant, -20);
    const loud = await listen(
      mixed(echo, joined(silence(2500), person)),
      60_000,
      BARGE_IN_LEVEL.echoCancelled,
    );
    expect(loud.events).toEqual(['start', 'end']);
    const quiet = await listen(
      mixed(echo, joined(silence(2500), scaled(person, -20))),
      60_000,
      BARGE_IN_LEVEL.echoCancelled,
    );
    expect(quiet.events).toEqual([]);
  }, 30_000);
});

function whiteNoise(ms: number, rms: number): Int16Array {
  let seed = 7;
  const raw = Array.from({ length: 16 * ms }, () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32 - 0.5;
  });
  const gain = rms / Math.sqrt(raw.reduce((sum, value) => sum + value ** 2, 0) / raw.length);
  return Int16Array.from(raw, (value) => Math.round(value * gain * 32768));
}

function fadedEnd(pcm: Int16Array, decibels: number): Int16Array {
  return Int16Array.from(pcm, (sample, index) => {
    const into = Math.max(0, index / pcm.length - 0.7) / 0.3;
    return Math.round(sample * 10 ** ((-into * decibels) / 20));
  });
}

describe('SpeechGate default tuning on recorded fixtures', () => {
  const person = fixture('person');
  const assistant = fixture('ai');
  const SENTENCE_MS = person.length / 16;

  it('captures quiet speech from its first word to its last', async () => {
    const reference = await listen(
      joined(silence(1000), person, silence(2500)),
      0,
      BARGE_IN_LEVEL.echoCancelled,
    );
    for (const decibels of [-20, -32, -38]) {
      const heard = await listen(
        joined(silence(1000), scaled(person, decibels), silence(2500)),
        0,
        BARGE_IN_LEVEL.echoCancelled,
      );
      expect(heard.events, `${String(decibels)} dB`).toEqual(['start', 'end']);
      expect(Math.abs((heard.first[0] ?? 0) - (reference.first[0] ?? 0))).toBeLessThanOrEqual(1024);
      expect(heard.sent.length).toBeGreaterThanOrEqual(reference.sent.length * 0.95);
    }
  }, 60_000);

  it('keeps a sentence with a short natural pause in one turn', async () => {
    const early = person.subarray(0, 40_000);
    const late = person.subarray(40_000);
    const heard = await listen(
      joined(silence(1000), early, silence(350), late, silence(2500)),
      0,
      BARGE_IN_LEVEL.echoCancelled,
    );
    expect(heard.events).toEqual(['start', 'end']);
    expect(heard.sent.length / 16).toBeGreaterThanOrEqual(SENTENCE_MS + 350);
  }, 30_000);

  it('still ends the turn after a long silence', async () => {
    const heard = await listen(
      joined(silence(1000), person, silence(2500), person, silence(2500)),
      0,
      BARGE_IN_LEVEL.echoCancelled,
    );
    expect(heard.events).toEqual(['start', 'end', 'start', 'end']);
  }, 30_000);

  it('sends a sentence that fades out softly to its end', async () => {
    const heard = await listen(
      joined(silence(1000), fadedEnd(person, 30), silence(2500)),
      0,
      BARGE_IN_LEVEL.echoCancelled,
    );
    expect(heard.events).toEqual(['start', 'end']);
    expect(heard.sent.length / 16).toBeGreaterThanOrEqual(SENTENCE_MS);
  }, 30_000);

  it('sends neither steady noise nor short noise bursts', async () => {
    const bursts = joined(
      ...Array.from({ length: 8 }, () => joined(silence(300), whiteNoise(120, 0.3))),
    );
    for (const input of [whiteNoise(4000, 0.02), whiteNoise(4000, 0.1), bursts]) {
      expect((await listen(input, 0, BARGE_IN_LEVEL.echoCancelled)).events).toEqual([]);
    }
  }, 60_000);

  it('never answers its own echo at any residual level a canceller leaves', async () => {
    for (const decibels of [-30, -20, -10]) {
      const heard = await listen(scaled(assistant, decibels), 60_000, BARGE_IN_LEVEL.echoCancelled);
      expect(heard.events, `${String(decibels)} dB`).toEqual([]);
    }
  }, 60_000);

  it('lets a person speak over the assistant at half the fixture level', async () => {
    const heard = await listen(
      mixed(scaled(assistant, -20), joined(silence(2500), scaled(person, -6))),
      60_000,
      BARGE_IN_LEVEL.echoCancelled,
    );
    expect(heard.events).toEqual(['start', 'end']);
  }, 60_000);
});
