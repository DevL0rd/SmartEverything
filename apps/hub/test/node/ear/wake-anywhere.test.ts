import { readFileSync } from 'node:fs';
import type { PauseChoiceMs, WakeSensitivity } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { describe, expect, it } from 'vitest';
import { sileroModel } from '../../../src/assistant-voice/silero-vad';
import { Ear } from '../../../src/node/ear/ear';
import type { WakeGrant } from '../../../src/wake-name/wake-claims';
import { realSpotter } from './real-spotter';

const SAMPLES_PER_MS = 16;
const FRAME = 320;
const START = Date.parse('2026-10-18T10:00:00.000Z');
const SENTENCE_PAUSE_MS: PauseChoiceMs = 2500;

function fixture(name: string): Int16Array {
  const bytes = readFileSync(new URL(`../../assistant/fixtures/${name}.pcm`, import.meta.url));
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function joined(...parts: readonly Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((total, part) => total + part.length, 0));
  let at = 0;
  parts.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return out;
}

const quiet = (ms: number): Int16Array => new Int16Array(ms * SAMPLES_PER_MS);

function whole(parts: readonly Int16Array[]): Int16Array {
  const all = joined(...parts);
  return all.subarray(0, all.length - (all.length % FRAME));
}

interface Woke {
  readonly phrase: string;
  readonly atMs: number;
  readonly words: () => Int16Array;
}

async function hear(
  sentence: Int16Array,
  names: readonly string[] = ['Coordinator'],
): Promise<{ readonly woke: Woke[]; readonly totalMs: number }> {
  const woke: Woke[] = [];
  let fed = 0;
  const ear = new Ear(
    {
      claims: {
        request: (): WakeGrant => ({ granted: true, onSuperseded: (): void => undefined }),
      },
      spotter: realSpotter(names).spotter,
      model: sileroModel,
      pauseMs: (): PauseChoiceMs => SENTENCE_PAUSE_MS,
      clock: {
        now: (): Date => new Date(START + fed / SAMPLES_PER_MS),
        at: (): (() => void) => (): void => undefined,
      },
      log: new Logger('hub.wake-name'),
    },
    {
      claim: { source: 'camera', key: 'living' },
      fields: { cameraId: 'living' },
      sensitivity: (): WakeSensitivity => 'standard',
      resting: (): boolean => false,
      wake: (phrase, words): void => {
        woke.push({ phrase, atMs: fed / SAMPLES_PER_MS, words });
      },
      speech: null,
    },
  );
  await ear.open();
  for (let offset = 0; offset + FRAME <= sentence.length; offset += FRAME) {
    fed += FRAME;
    ear.hear(sentence.slice(offset, offset + FRAME));
  }
  await ear.close();
  return { woke, totalMs: sentence.length / SAMPLES_PER_MS };
}

function leadMs(sentence: Int16Array, words: Int16Array): number {
  const wordsFrom = sentence.length - words.length;
  expect(sentence.subarray(wordsFrom)).toEqual(words);
  return wordsFrom / SAMPLES_PER_MS;
}

describe('wake on the name anywhere in a sentence', () => {
  const talk = fixture('person');
  const nameSaid = fixture('hw_us1').subarray(0, 2600 * SAMPLES_PER_MS);

  it('wakes on the name at the start and hands over the whole sentence', async () => {
    const sentence = whole([quiet(500), nameSaid, talk, quiet(500)]);
    const { woke } = await hear(sentence);
    expect(woke).toHaveLength(1);
    expect(leadMs(sentence, woke[0]?.words() ?? new Int16Array(0))).toBeLessThan(1000);
  }, 60_000);

  it('wakes on the name in the middle and hands over what came before it', async () => {
    const sentence = whole([quiet(500), talk, nameSaid, talk, quiet(500)]);
    const { woke } = await hear(sentence);
    expect(woke).toHaveLength(1);
    expect(leadMs(sentence, woke[0]?.words() ?? new Int16Array(0))).toBeLessThan(1000);
  }, 60_000);

  it('wakes on the name at the end and hands over the whole sentence before it', async () => {
    const sentence = whole([quiet(500), talk, nameSaid, quiet(500)]);
    const { woke } = await hear(sentence);
    expect(woke).toHaveLength(1);
    const words = woke[0]?.words() ?? new Int16Array(0);
    expect(leadMs(sentence, words)).toBeLessThan(1000);
    expect(words.length / SAMPLES_PER_MS).toBeGreaterThan(talk.length / SAMPLES_PER_MS);
  }, 60_000);

  it('starts the call while the sentence is still being said, not after it ends', async () => {
    const sentence = whole([quiet(500), talk, nameSaid, talk, talk, quiet(500)]);
    const { woke, totalMs } = await hear(sentence);
    expect(woke).toHaveLength(1);
    const wokeAt = woke[0]?.atMs ?? Infinity;
    expect(totalMs - wokeAt).toBeGreaterThan(talk.length / SAMPLES_PER_MS);
  }, 60_000);

  it('does not wake for a sentence without the name', async () => {
    const { woke } = await hear(whole([quiet(500), talk, talk, quiet(500)]));
    expect(woke).toEqual([]);
  }, 60_000);
});
