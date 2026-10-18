import type { SpeechSegment } from '../../src/wake-name/ear';
import { describe, expect, it } from 'vitest';
import { peakLevel, Utterances, type Skipped } from '../../src/transcripts/utterances';
import { FakeClock } from '../support/fake-clock';

const START = '2026-10-15T18:00:00.000Z';
const SAMPLES_PER_MS = 16;

function tone(ms: number, decibels: number): Int16Array {
  const amplitude = 32_768 * 10 ** (decibels / 20) * Math.SQRT2;
  return Int16Array.from({ length: ms * SAMPLES_PER_MS }, (_, index) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * 220 * index) / 16_000)),
  );
}

function harness(): {
  clock: FakeClock;
  utterances: Utterances;
  heard: SpeechSegment[];
  deliveredAt: number[];
  skipped: Skipped[];
  say: (atMs: number, ms: number, decibels?: number) => void;
} {
  const clock = new FakeClock(START);
  const heard: SpeechSegment[] = [];
  const deliveredAt: number[] = [];
  const skipped: Skipped[] = [];
  const utterances = new Utterances(clock, {
    heard: (utterance): void => {
      heard.push(utterance);
      deliveredAt.push(clock.now().getTime());
    },
    skipped: (reason): void => {
      skipped.push(reason);
    },
  });
  const base = Date.parse(START);
  const say = (atMs: number, ms: number, decibels = -15): void => {
    clock.advanceTo(new Date(base + atMs + ms).toISOString());
    utterances.add({ startedAt: base + atMs, endedAt: base + atMs + ms, pcm: tone(ms, decibels) });
  };
  return { clock, utterances, heard, deliveredAt, skipped, say };
}

describe('peakLevel', () => {
  it('reads the loudest 32 ms frame', () => {
    const pcm = new Int16Array(16_000);
    pcm.set(tone(64, -12), 8000);
    expect(20 * Math.log10(peakLevel(pcm))).toBeCloseTo(-12, 0);
  });
});

describe('Utterances', () => {
  it('joins fragments of one sentence split by short pauses into one request', () => {
    const { clock, heard, say } = harness();
    say(0, 700);
    say(1500, 500);
    say(2800, 900);
    expect(heard).toHaveLength(0);
    clock.advanceTo('2026-10-15T18:00:10.000Z');
    expect(heard).toHaveLength(1);
    expect(heard[0]?.startedAt).toBe(Date.parse(START));
    expect(heard[0]?.endedAt).toBe(Date.parse(START) + 3700);
    expect(heard[0]?.pcm.length).toBe((700 + 500 + 900 + 2 * 250) * SAMPLES_PER_MS);
  });

  it('sends separate utterances when the pause is longer than the hold', () => {
    const { clock, heard, say } = harness();
    say(0, 1000);
    say(4000, 1000);
    say(9000, 1000);
    clock.advanceTo('2026-10-15T18:00:20.000Z');
    expect(heard.map((utterance) => utterance.pcm.length)).toEqual([16_000, 16_000, 16_000]);
  });

  it('delivers a single phrase within 5 s of its end', () => {
    const { clock, heard, say } = harness();
    say(0, 1500);
    clock.advanceTo('2026-10-15T18:00:04.900Z');
    expect(heard).toHaveLength(1);
  });

  it('keeps pace in a continuous conversation with 1-3 s pauses, in few lines', () => {
    const { clock, heard, deliveredAt, say } = harness();
    const pauses = [1000, 3000, 2000, 1500, 2500, 1000, 2000, 3000, 1000, 2000];
    let at = 0;
    for (const pause of pauses) {
      say(at, 1200);
      at += 1200 + pause;
    }
    clock.advanceTo(new Date(Date.parse(START) + at + 5000).toISOString());
    expect(heard.length).toBeLessThanOrEqual(8);
    expect(heard.length).toBeLessThan(pauses.length);
    heard.forEach((line, index) => {
      expect((deliveredAt[index] ?? 0) - line.endedAt).toBeLessThanOrEqual(2500);
    });
  });

  it('skips quiet segments below -30 dBFS, where the logged junk lived', () => {
    const { clock, heard, skipped, say } = harness();
    say(0, 2000, -40);
    clock.advanceTo('2026-10-15T18:00:10.000Z');
    expect(heard).toHaveLength(0);
    expect(skipped).toEqual(['quiet']);
  });

  it('keeps quiet fragments out of a loud utterance', () => {
    const { clock, heard, say } = harness();
    say(0, 1000);
    say(1200, 400, -45);
    clock.advanceTo('2026-10-15T18:00:10.000Z');
    expect(heard[0]?.pcm.length).toBe(16_000);
  });

  it('skips a lone blip shorter than 600 ms', () => {
    const { clock, heard, skipped, say } = harness();
    say(0, 450);
    clock.advanceTo('2026-10-15T18:00:10.000Z');
    expect(heard).toHaveLength(0);
    expect(skipped).toEqual(['short']);
  });

  it('sends a short word when it joins a longer utterance', () => {
    const { clock, heard, say } = harness();
    say(0, 450);
    say(1000, 450);
    clock.advanceTo('2026-10-15T18:00:10.000Z');
    expect(heard).toHaveLength(1);
  });

  it('cuts a long run of speech at a pause once it passes 4 s', () => {
    const { heard, say } = harness();
    say(0, 1000);
    say(1700, 1000);
    say(3400, 1000);
    expect(heard).toHaveLength(1);
    expect(heard[0]?.endedAt).toBe(Date.parse(START) + 4400);
  });
});
