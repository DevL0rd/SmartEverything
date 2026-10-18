import { describe, expect, it } from 'vitest';
import {
  HANDOFF_LIMIT_MS,
  LOOKBACK_MS,
  REPLAY_MS,
  WakeHandoff,
} from '../../src/wake-name/wake-handoff';

const chunk = (value: number, ms = 20): Int16Array => new Int16Array(16 * ms).fill(value);

describe('WakeHandoff', () => {
  it('hands over the wake phrase and everything said until the call takes it', () => {
    const handoff = new WakeHandoff();
    for (let index = 0; index < 200; index++) {
      handoff.keep(chunk(1));
    }
    handoff.keep(chunk(2));
    const take = handoff.begin();
    handoff.keep(chunk(3));
    handoff.keep(chunk(4));
    const words = take();
    expect(words.length).toBe(16 * (REPLAY_MS + 40));
    expect(words.at(-1)).toBe(4);
    expect(words.at(-16 * 20 - 1)).toBe(3);
    expect(take()).toHaveLength(0);
  });

  it('gives nothing once nobody took the words within the limit', () => {
    const handoff = new WakeHandoff();
    const take = handoff.begin();
    for (let ms = 0; ms <= HANDOFF_LIMIT_MS; ms += 20) {
      handoff.keep(chunk(5));
    }
    expect(take()).toHaveLength(0);
  });

  it('starts a fresh replay after a hand-off', () => {
    const handoff = new WakeHandoff();
    handoff.begin()();
    handoff.keep(chunk(7));
    expect(handoff.begin()()).toEqual(chunk(7));
  });

  it('measures the level of the last second only, in dBFS', () => {
    const handoff = new WakeHandoff();
    for (let index = 0; index < 100; index++) {
      handoff.keep(chunk(16_384));
    }
    for (let index = 0; index < 50; index++) {
      handoff.keep(chunk(3277));
    }
    expect(handoff.level(1000)).toBeCloseTo(-20, 1);
  });

  it('reports a floor for silence and for no audio at all', () => {
    const handoff = new WakeHandoff();
    expect(handoff.level(1000)).toBe(-120);
    handoff.keep(chunk(0));
    expect(handoff.level(1000)).toBe(-120);
  });

  it('measures from the held audio while a wake is being handed over', () => {
    const handoff = new WakeHandoff();
    handoff.keep(chunk(32_767));
    handoff.begin();
    for (let index = 0; index < 50; index++) {
      handoff.keep(chunk(3277));
    }
    expect(handoff.level(1000)).toBeCloseTo(-20, 1);
  });

  describe('hand-over from the start of the sentence the wake came in', () => {
    const fill = (handoff: WakeHandoff, ms: number, value: number): void => {
      for (let at = 0; at < ms; at += 20) {
        handoff.keep(chunk(value));
      }
    };
    const samplesOf = (ms: number): number => 16 * ms;

    it('starts at the first word when the name comes last', () => {
      const handoff = new WakeHandoff();
      fill(handoff, 1000, 0);
      handoff.sentenceBegan(samplesOf(1000));
      fill(handoff, 7000, 1);
      const take = handoff.begin();
      fill(handoff, 400, 2);
      const words = take();
      expect(words).toHaveLength(samplesOf(7400));
      expect(words[0]).toBe(1);
      expect(words.at(-1)).toBe(2);
    });

    it('reaches the first word when the words are taken at the moment of the wake', () => {
      const handoff = new WakeHandoff();
      fill(handoff, 1000, 0);
      handoff.sentenceBegan(samplesOf(1000));
      fill(handoff, 7000, 1);
      const words = handoff.begin()();
      expect(words).toHaveLength(samplesOf(7000));
      expect(words[0]).toBe(1);
    });

    it('starts at the first word when the name comes first', () => {
      const handoff = new WakeHandoff();
      fill(handoff, 1000, 0);
      handoff.sentenceBegan(samplesOf(1000));
      fill(handoff, 600, 1);
      const take = handoff.begin();
      fill(handoff, 3000, 2);
      expect(take()).toHaveLength(samplesOf(3600));
    });

    it('never reaches back further than the lookback', () => {
      const handoff = new WakeHandoff();
      handoff.sentenceBegan(0);
      fill(handoff, LOOKBACK_MS + 10_000, 1);
      const words = handoff.begin()();
      expect(words.length).toBeLessThanOrEqual(samplesOf(LOOKBACK_MS));
      expect(words.length).toBeGreaterThan(samplesOf(LOOKBACK_MS - 100));
    });

    it('takes the default replay when the sentence ended before the wake', () => {
      const handoff = new WakeHandoff();
      fill(handoff, 1000, 0);
      handoff.sentenceBegan(samplesOf(1000));
      fill(handoff, 6000, 1);
      handoff.sentenceEnded();
      fill(handoff, 500, 0);
      expect(handoff.begin()()).toHaveLength(samplesOf(REPLAY_MS));
    });

    it('takes the sentence even when the voice detector reports it after the wake', () => {
      const handoff = new WakeHandoff();
      fill(handoff, 1000, 0);
      fill(handoff, 7000, 1);
      const take = handoff.begin();
      handoff.sentenceBegan(samplesOf(1000));
      fill(handoff, 200, 2);
      expect(take()).toHaveLength(samplesOf(7200));
    });

    it('ignores a sentence that only began after the wake', () => {
      const handoff = new WakeHandoff();
      fill(handoff, 5000, 1);
      const take = handoff.begin();
      fill(handoff, 1000, 2);
      handoff.sentenceBegan(samplesOf(5500));
      expect(take()).toHaveLength(samplesOf(REPLAY_MS + 1000));
    });
  });
});
