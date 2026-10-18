import { describe, expect, it } from 'vitest';
import { CARD_RING_KEYS, ringsOf } from './rings-model';
import { COMPOSITION } from '../../../store/body-fixture';

describe('composition rings', () => {
  it('gives the card fat, muscle and water and the page bone as well', () => {
    expect(ringsOf(COMPOSITION, CARD_RING_KEYS).map((ring) => ring.key)).toEqual([
      'fat',
      'muscle',
      'water',
    ]);
    expect(ringsOf(COMPOSITION).map((ring) => ring.key)).toEqual([
      'fat',
      'muscle',
      'water',
      'bone',
    ]);
  });

  it('fills each ring with its share of the body and keeps it inside the ring', () => {
    for (const ring of ringsOf(COMPOSITION)) {
      expect(ring.fill).toBeGreaterThan(0);
      expect(ring.fill).toBeLessThanOrEqual(1);
    }
    const extreme = { ...COMPOSITION, body_fat_percent: 90, bone_percent: -3 };
    const [fat, , , bone] = ringsOf(extreme);
    expect([fat?.fill, bone?.fill]).toEqual([1, 0]);
  });

  it('writes the values the way the body page does and reads them out in full', () => {
    const [fat, muscle, water, bone] = ringsOf(COMPOSITION);
    expect(fat?.text).toBe(`${String(Math.round(COMPOSITION.body_fat_percent))} %`);
    expect(muscle?.text).toBe(`${String(Math.round(COMPOSITION.muscle_mass_kg))} kg`);
    expect(water?.spoken).toBe(`Water ${String(Math.round(COMPOSITION.water_percent))} %`);
    expect(bone?.text).toBe(`${COMPOSITION.bone_mass_kg.toFixed(1)} kg`);
  });

  it('points every ring at a band the composition reports', () => {
    for (const ring of ringsOf(COMPOSITION)) {
      expect(COMPOSITION.bands[ring.band]).toBeDefined();
    }
  });
});
