import type { JsonValue } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { seededDraw } from '../../../src/automations/world-v3/random';
import type { ReadResult } from '../../../src/automations/world-v3/read-port';
import { createWorldReads } from '../../../src/automations/world-v3/world-reads';
import { NOW, SCOPE, furnish, type Home } from './support';

let home: Home;

beforeEach(async () => {
  home = await furnish();
});

afterEach(async () => {
  await home.test.close();
});

const MINUTE = 60_000;

describe('clock reads', () => {
  it('reads now from the injected clock', () => {
    expect(home.read('date.now').outputs).toEqual({ at: NOW });
  });

  it('builds a time of day in the home zone across the autumn clock change', () => {
    home.test.store.settings.updateHome({ time_zone: 'Europe/Berlin' });
    home.clock.current = new Date('2026-10-24T23:30:00.000Z');
    const at = (clock: string, day: string): unknown =>
      home.read('date.today_at', { clock, day }).outputs['at'];
    expect(at('12:00', 'today')).toBe('2026-10-25T11:00:00.000Z');
    expect(at('12:00', 'tomorrow')).toBe('2026-10-26T11:00:00.000Z');
    expect(at('01:00', 'next')).toBe('2026-10-26T00:00:00.000Z');
    expect(at('12:00', 'next')).toBe('2026-10-25T11:00:00.000Z');
  });

  it('uses today as the default day', () => {
    expect(home.read('date.today_at', { clock: '18:30' }).outputs['at']).toBe(
      '2026-10-18T18:30:00.000Z',
    );
  });

  it('measures the time since and until a moment, never below zero', () => {
    const since = (instant: string, until?: boolean): unknown =>
      home.read('date.since', { instant, ...(until === undefined ? {} : { until }) }).outputs[
        'duration'
      ];
    expect(since('2026-10-18T11:00:00.000Z')).toBe(60 * MINUTE);
    expect(since('2026-10-18T13:30:00.000Z', true)).toBe(90 * MINUTE);
    expect(since('2026-10-18T13:30:00.000Z')).toBe(0);
    expect(since('2026-10-18T11:00:00.000Z', true)).toBe(0);
  });

  it('refuses text that is not a moment', () => {
    expect(() => home.read('date.since', { instant: 'soon' })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
    expect(() => home.read('date.today_at', { clock: '25:00' })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
  });
});

describe('logic.daylight', () => {
  it('is day at noon and night at midnight in the home zone', () => {
    home.test.store.settings.updateHome({
      time_zone: 'Europe/Berlin',
      latitude: 52.5,
      longitude: 13.4,
    });
    const at = (iso: string, is: string): unknown => {
      home.clock.current = new Date(iso);
      return home.read('logic.daylight', { is }).outputs['result'];
    };
    expect(at('2026-06-20T10:00:00.000Z', 'day')).toBe(true);
    expect(at('2026-06-20T10:00:00.000Z', 'night')).toBe(false);
    expect(at('2026-06-20T23:00:00.000Z', 'night')).toBe(true);
  });

  it('moves the boundaries with the offsets', () => {
    home.test.store.settings.updateHome({ time_zone: 'UTC', latitude: 0, longitude: 0 });
    home.clock.current = new Date('2026-03-20T06:30:00.000Z');
    const night = (offset: number): unknown =>
      home.read('logic.daylight', { is: 'night', sunriseOffset: offset * MINUTE }).outputs[
        'result'
      ];
    expect(night(0)).toBe(false);
    expect(night(120)).toBe(true);
  });
});

function itemsOf(result: ReadResult): unknown {
  return result.outputs['item'];
}

const topDraw = (): number => 1;

describe('random reads', () => {
  it('draws the same numbers for the same run, node and activation', () => {
    const first = seededDraw('run:a:0');
    const second = seededDraw('run:a:0');
    const other = seededDraw('run:a:1');
    const firstDraws = [first(), first(), first()];
    expect([second(), second(), second()]).toEqual(firstDraws);
    expect([other(), other(), other()]).not.toEqual(firstDraws);
    expect(firstDraws.every((draw) => draw >= 0 && draw < 1)).toBe(true);
  });

  it('gives a fixed result for a scope and varies with the activation', () => {
    const roll = (activation: number): unknown =>
      home.read('random.number', { min: 1, max: 1_000_000 }, { activation: String(activation) })
        .outputs['value'];
    expect(roll(0)).toBe(roll(0));
    expect(new Set([0, 1, 2, 3, 4, 5].map(roll)).size).toBeGreaterThan(1);
  });

  it('keeps whole numbers inside the bounds and reaches both ends', () => {
    const seen = new Set<unknown>();
    for (let activation = 0; activation < 200; activation += 1) {
      seen.add(
        home.read('random.number', { min: 3, max: 5 }, { activation: String(activation) }).outputs[
          'value'
        ],
      );
    }
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('keeps decimals inside the bounds', () => {
    for (let activation = 0; activation < 50; activation += 1) {
      const value = home.read(
        'random.number',
        { min: 0.5, max: 0.75, integer: false },
        { activation: String(activation) },
      ).outputs['value'];
      expect(typeof value === 'number' && value >= 0.5 && value < 0.75).toBe(true);
    }
  });

  it('rounds the bounds inward for whole numbers and refuses an empty range', () => {
    expect(() => home.read('random.number', { min: 2.2, max: 2.8 })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
    expect(() => home.read('random.number', { min: 6, max: 5 })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
  });

  it('picks from a list with its position', () => {
    const result = home.read('random.choice', { list: ['a', 'b', 'c'] });
    expect(['a', 'b', 'c'][Number(result.outputs['index'])]).toBe(itemsOf(result));
    expect(result.memory).toBeUndefined();
  });

  it('favours heavy items and never picks an item with weight zero', () => {
    const picks = [...Array(100).keys()].map((activation) =>
      itemsOf(
        home.read(
          'random.choice',
          { list: ['a', 'b', 'c'], weights: [0, 1, 9] },
          { activation: String(activation) },
        ),
      ),
    );
    expect(picks).not.toContain('a');
    expect(picks.filter((pick) => pick === 'c').length).toBeGreaterThan(
      picks.filter((pick) => pick === 'b').length,
    );
  });

  it('picks the last item that has a chance when the draw is at the very top', () => {
    const topped = createWorldReads({ ...home.deps, random: { draw: () => topDraw } });
    const pick = (weights: number[]): unknown =>
      topped.read('random.choice', { list: ['a', 'b', 'c'], weights }, SCOPE).outputs['item'];
    expect(pick([1, 1, 1])).toBe('c');
    expect(pick([1, 2, 0])).toBe('b');
  });

  it('uses every item once before repeating any, carrying its memory between reads', () => {
    let memory: JsonValue | undefined;
    const seen: unknown[] = [];
    for (let round = 0; round < 6; round += 1) {
      const result = home.read(
        'random.choice',
        { list: ['a', 'b', 'c'], noRepeat: true },
        { activation: String(round), ...(memory === undefined ? {} : { memory }) },
      );
      seen.push(itemsOf(result));
      memory = result.memory;
    }
    expect([...seen.slice(0, 3)].sort()).toEqual(['a', 'b', 'c']);
    expect([...seen.slice(3)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('starts a new cycle when the list changed length', () => {
    const first = home.read('random.choice', { list: ['a', 'b'], noRepeat: true });
    const next = home.read(
      'random.choice',
      { list: ['a', 'b', 'c'], noRepeat: true },
      { memory: first.memory ?? null },
    );
    expect(next.memory).toEqual({ size: 3, used: [next.outputs['index']] });
  });

  it('refuses a list with no items, mismatched weights and weights that allow no pick', () => {
    expect(() => home.read('random.choice', { list: [] })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
    expect(() => home.read('random.choice', { list: ['a', 'b'], weights: [1] })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
    expect(() => home.read('random.choice', { list: ['a', 'b'], weights: [0, 0] })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
    expect(() => home.read('random.number', { min: 5 })).toThrow(
      expect.objectContaining({ errorClass: 'Invalid' }),
    );
  });
});
