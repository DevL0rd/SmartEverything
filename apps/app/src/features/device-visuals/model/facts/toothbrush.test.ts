import { describe, expect, it } from 'vitest';
import type { ObservedValues } from '../lookup';
import { toothbrushFacts } from './toothbrush';

function valuesOf(pairs: Readonly<Record<string, string | number | boolean>>): ObservedValues {
  return Object.fromEntries(
    Object.entries(pairs).map(([key, value]) => [
      key,
      { value, observedAt: '2026-10-18T12:00:00Z' },
    ]),
  );
}

describe('toothbrush visual facts', () => {
  it('shows an unknown brush as asleep with nothing else', () => {
    expect(toothbrushFacts({}, 'sonicare')).toEqual({
      brand: 'sonicare',
      activity: 'asleep',
      link: 'asleep',
      mode: null,
      intensity: null,
      pressure: null,
      head: null,
      headType: null,
      wear: null,
      battery: null,
      fault: false,
      ring: null,
      face: null,
      sector: null,
      daysLeftRatio: null,
      elapsedS: null,
      display: true,
      handle: null,
    });
  });

  it('reads what the hub reported', () => {
    const facts = toothbrushFacts(
      valuesOf({
        brush_activity: 'brushing',
        brush_link: 'linked',
        brush_mode: 'gum_health',
        brush_intensity: 'high',
        brush_head: 'fitted',
        brush_head_type: 'gums',
        brush_head_wear: 40,
        battery: 71,
        brush_fault: true,
      }),
      'sonicare',
    );
    expect(facts).toEqual({
      brand: 'sonicare',
      activity: 'brushing',
      link: 'linked',
      mode: 'gum_health',
      intensity: 'high',
      pressure: null,
      head: 'fitted',
      headType: 'gums',
      wear: 0.4,
      battery: 71,
      fault: true,
      ring: null,
      face: null,
      sector: null,
      daysLeftRatio: null,
      elapsedS: null,
      display: true,
      handle: null,
    });
  });

  it('ignores a value it does not know and keeps the wear between zero and one', () => {
    expect(toothbrushFacts(valuesOf({ brush_mode: 'turbo' }), 'sonicare').mode).toBeNull();
    expect(toothbrushFacts(valuesOf({ brush_head_wear: 180 }), 'sonicare').wear).toBe(1);
    expect(toothbrushFacts(valuesOf({ brush_head_wear: -5 }), 'sonicare').wear).toBe(0);
  });

  it('reads the configured ring colour of an Oral-B brush as a display colour', () => {
    expect(toothbrushFacts(valuesOf({ brush_ring_colour: 'white' }), 'oralb')).toMatchObject({
      brand: 'oralb',
      ring: '#ffffff',
    });
    expect(toothbrushFacts(valuesOf({ brush_ring_colour: 'custom' }), 'oralb').ring).toBeNull();
  });
});
