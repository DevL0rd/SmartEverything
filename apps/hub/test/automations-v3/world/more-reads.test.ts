import { sunEventOn, type JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReadInputs } from '../../../src/automations/world-v3/read-port';
import { SCOPE, furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

const moment = (value: JsonValue | undefined): number =>
  typeof value === 'string' ? Date.parse(value) : Number.NaN;

const seeds = (count: number): readonly number[] => Array.from({ length: count }, (_, i) => i);

describe('random.chance', () => {
  const flip = (probability: number, seed: number): unknown =>
    home.read('random.chance', { probability }, { seed }).outputs['result'];

  it('never comes up at 0 and always at 1', () => {
    expect(seeds(50).every((seed) => flip(0, seed) === false)).toBe(true);
    expect(seeds(50).every((seed) => flip(1, seed) === true)).toBe(true);
  });

  it('repeats for the same seed and spreads over seeds', () => {
    expect(flip(0.5, 3)).toBe(flip(0.5, 3));
    const hits = seeds(300).filter((seed) => flip(0.3, seed) === true).length;
    expect(hits).toBeGreaterThan(50);
    expect(hits).toBeLessThan(130);
  });

  it('refuses a probability outside 0 to 1', () => {
    expect(() => home.read('random.chance', { probability: 1.5 })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
  });
});

describe('random.duration', () => {
  const MINUTE = 60_000;
  const delay = (min: number, max: number, seed: number): number =>
    Number(home.read('random.duration', { min, max }, { seed }).outputs['duration']);

  it('stays within the limits, both included, and repeats for a seed', () => {
    const delays = seeds(200).map((seed) => delay(5 * MINUTE, 20 * MINUTE, seed));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(5 * MINUTE);
    expect(Math.max(...delays)).toBeLessThanOrEqual(20 * MINUTE);
    expect(new Set(delays).size).toBeGreaterThan(150);
    expect(delay(5 * MINUTE, 20 * MINUTE, 9)).toBe(delay(5 * MINUTE, 20 * MINUTE, 9));
    expect(delay(MINUTE, MINUTE, 4)).toBe(MINUTE);
  });

  it('reaches the top of a tiny range', () => {
    const delays = new Set(seeds(100).map((seed) => delay(0, 1, seed)));
    expect([...delays].sort()).toEqual([0, 1]);
  });

  it('refuses limits that are the wrong way round or negative', () => {
    expect(() => home.read('random.duration', { min: 10, max: 5 })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
    expect(() => home.read('random.duration', { min: -1, max: 5 })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
  });
});

describe('logic.changed', () => {
  it('counts the first run as changed with no previous value and remembers the value', () => {
    const first = home.read('logic.changed', { value: 5 }, SCOPE);
    expect(first.outputs).toEqual({ changed: true });
    expect(first.memory).toEqual({ value: 5 });
  });

  it('compares with the remembered value, including structures and null', () => {
    const run = (value: JsonValue, memory: JsonValue): ReturnType<Home['read']> =>
      home.read('logic.changed', { value }, { ...SCOPE, memory });
    expect(run(5, { value: 5 }).outputs).toEqual({ changed: false, previous: 5 });
    expect(run(6, { value: 5 }).outputs).toEqual({ changed: true, previous: 5 });
    expect(run({ a: [1, 2] }, { value: { a: [1, 2] } }).outputs['changed']).toBe(false);
    expect(run({ a: [1, 2] }, { value: { a: [2, 1] } }).outputs['changed']).toBe(true);
    expect(run(null, { value: null }).outputs).toEqual({ changed: false, previous: null });
    expect(run(null, { value: 0 }).outputs['changed']).toBe(true);
    expect(run(1, 'garbage').outputs).toEqual({ changed: true });
  });
});

describe('date.sun_times', () => {
  const sun = (inputs: ReadInputs = {}): ReadInputs => home.read('date.sun_times', inputs).outputs;

  it('fails with NotFound while the home has no location', () => {
    expect(() => sun()).toThrow(expect.objectContaining({ errorClass: 'NotFound' }));
  });

  describe('with a home in Berlin', () => {
    beforeEach(() => {
      home.test.store.settings.updateHome({
        time_zone: 'Europe/Berlin',
        latitude: 52.5,
        longitude: 13.4,
      });
    });

    it('orders the day and agrees with the sun module on sunrise and sunset', () => {
      const day = sun({ date: '2026-06-21' });
      const at = (name: string): number => moment(day[name]);
      expect(at('dawn')).toBeLessThan(at('sunrise'));
      expect(at('sunrise')).toBeLessThan(at('solarNoon'));
      expect(at('solarNoon')).toBeLessThan(at('goldenHour'));
      expect(at('goldenHour')).toBeLessThan(at('sunset'));
      expect(at('sunset')).toBeLessThan(at('dusk'));
      const point = { latitude: 52.5, longitude: 13.4 };
      const date = { year: 2026, month: 6, day: 21 };
      expect(day['sunrise']).toBe(sunEventOn('sunrise', date, point)?.toISOString());
      expect(day['sunset']).toBe(sunEventOn('sunset', date, point)?.toISOString());
      expect(at('sunrise')).toBeGreaterThan(Date.parse('2026-06-21T02:30:00Z'));
      expect(at('sunrise')).toBeLessThan(Date.parse('2026-06-21T03:10:00Z'));
      expect(at('sunset')).toBeGreaterThan(Date.parse('2026-06-21T19:00:00Z'));
      expect(at('sunset')).toBeLessThan(Date.parse('2026-06-21T19:45:00Z'));
    });

    it('uses today in the home zone when no date is given', () => {
      expect(sun()).toEqual(sun({ date: '2026-10-18' }));
    });

    it('shifts every time by the offset', () => {
      const plain = sun({ date: '2026-10-18' });
      const shifted = sun({ date: '2026-10-18', offset: 3_600_000 });
      for (const name of Object.keys(plain)) {
        expect(moment(shifted[name]) - moment(plain[name])).toBe(3_600_000);
      }
    });

    it('refuses a day that is not on the calendar', () => {
      expect(() => sun({ date: '2026-02-30' })).toThrow(
        expect.objectContaining({ errorClass: 'Invalid' }),
      );
    });
  });

  it('leaves out the times the sun does not reach near the pole', () => {
    home.test.store.settings.updateHome({ time_zone: 'UTC', latitude: 89, longitude: 0 });
    const summer = sun({ date: '2026-06-21' });
    expect(Object.keys(summer)).toEqual(['solarNoon']);
    const winter = sun({ date: '2026-12-21' });
    expect(Object.keys(winter)).toEqual(['solarNoon']);
  });
});
