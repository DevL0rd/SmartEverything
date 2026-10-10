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
  readonly events: string[];
  readonly sent: Int16Array;
}

async function listen(input: Int16Array, audibleUntilMs: number, level: number): Promise<Heard> {
  let at = 0;
  const events: string[] = [];
  const sent: Int16Array[] = [];
  const gate = new SpeechGate(
    await sileroModel(),
    {
      start: (): void => {
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
  return { events, sent: joined(...sent) };
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
