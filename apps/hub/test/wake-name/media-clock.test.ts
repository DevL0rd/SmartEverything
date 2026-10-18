import { describe, expect, it } from 'vitest';
import { MediaClock } from '../../src/wake-name/media-clock';

const CHUNK = 320;

describe('MediaClock', () => {
  it('places samples on the audio timeline, not on when they were processed', () => {
    const clock = new MediaClock();
    for (let chunk = 0; chunk < 10; chunk += 1) {
      clock.hear(CHUNK, 1_000 + (chunk + 1) * 20);
    }
    expect(clock.wallAt(0)).toBe(1_000);
    expect(clock.wallAt(CHUNK * 5)).toBe(1_100);
    expect(clock.wallAt(CHUNK * 10)).toBe(1_200);
  });

  it('settles on the earliest arrival so network delay never shifts captions later', () => {
    const clock = new MediaClock();
    clock.hear(CHUNK, 1_150);
    clock.hear(CHUNK, 1_040);
    clock.hear(CHUNK, 1_200);
    expect(clock.wallAt(0)).toBe(1_000);
    expect(clock.wallAt(CHUNK * 3)).toBe(1_060);
  });

  it('follows the wall clock again after the stream stalls', () => {
    const clock = new MediaClock();
    clock.hear(CHUNK, 1_020);
    clock.hear(CHUNK, 1_040);
    clock.hear(CHUNK, 9_020);
    expect(clock.wallAt(CHUNK * 2)).toBe(9_000);
    expect(clock.wallAt(CHUNK)).toBe(1_020);
  });

  it('is not known before any audio arrived', () => {
    expect(new MediaClock().wallAt(0)).toBeNaN();
  });
});
