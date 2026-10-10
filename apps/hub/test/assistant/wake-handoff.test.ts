import { describe, expect, it } from 'vitest';
import { HANDOFF_LIMIT_MS, REPLAY_MS, WakeHandoff } from '../../src/wake-name/wake-handoff';

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
});
