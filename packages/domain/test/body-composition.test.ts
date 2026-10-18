import { describe, expect, it } from 'vitest';
import {
  BODY_COMPOSITION,
  COMPOSITION_FORMULA,
  IMPEDANCE_RANGE,
  bmiOf,
  bodyComposition,
  idealWeight,
  impedancePair,
  type CompositionInput,
} from '../src/body-composition';

const FIT_MAN: CompositionInput = {
  sex: 'male',
  age: 35,
  heightCm: 180,
  weightKg: 80,
  impedanceLow: 480,
  impedanceHigh: 520,
};
const AVERAGE_WOMAN: CompositionInput = {
  sex: 'female',
  age: 28,
  heightCm: 165,
  weightKg: 58,
  impedanceLow: 560,
  impedanceHigh: null,
};
const HEAVY_MAN: CompositionInput = {
  sex: 'male',
  age: 55,
  heightCm: 168,
  weightKg: 105,
  impedanceLow: 400,
  impedanceHigh: 430,
};
const SMALL_OLDER_WOMAN: CompositionInput = {
  sex: 'female',
  age: 70,
  heightCm: 150,
  weightKg: 40,
  impedanceLow: 700,
  impedanceHigh: 740,
};
const LEAN_TALL_MAN: CompositionInput = {
  sex: 'male',
  age: 20,
  heightCm: 190,
  weightKg: 60,
  impedanceLow: 900,
  impedanceHigh: null,
};
const HEAVY_WOMAN: CompositionInput = {
  sex: 'female',
  age: 45,
  heightCm: 158,
  weightKg: 95,
  impedanceLow: 450,
  impedanceHigh: null,
};

describe('body composition from two impedance readings', () => {
  it('names the formula so stored results can be told apart from a future one', () => {
    expect(COMPOSITION_FORMULA).toBe('mi-dual-1');
    expect(bodyComposition(FIT_MAN).formula).toBe(COMPOSITION_FORMULA);
  });

  it('describes a fit man with both impedances, water split included', () => {
    expect(bodyComposition(FIT_MAN)).toMatchObject({
      body_fat_percent: 22.5,
      fat_mass_kg: 17.99,
      lean_mass_kg: 62.01,
      muscle_mass_kg: 58.89,
      skeletal_muscle_kg: 33.51,
      bone_mass_kg: 3.12,
      water_percent: 56.6,
      extracellular_water_kg: 18.41,
      intracellular_water_kg: 26.86,
      ecw_ratio_percent: 40.7,
      protein_percent: 15.1,
      visceral_fat: 11.5,
      bmr_kcal: 1709,
      body_age: 37,
      ideal_weight_kg: 70,
      weight_control_kg: -10,
      fat_control_kg: -0.4,
      muscle_control_kg: 0,
      body_type: 'overweight',
      body_score: 62,
    });
  });

  it('leaves the water split out when only one impedance was read', () => {
    expect(bodyComposition(AVERAGE_WOMAN)).toMatchObject({
      body_fat_percent: 27.4,
      muscle_mass_kg: 40.28,
      visceral_fat: 4.1,
      bmr_kcal: 1279,
      body_age: 30,
      ideal_weight_kg: 57,
      weight_control_kg: -1,
      body_type: 'balanced_skinny',
      body_score: 83,
      extracellular_water_kg: null,
      intracellular_water_kg: null,
      ecw_ratio_percent: null,
    });
    expect(bodyComposition(AVERAGE_WOMAN).bands).not.toHaveProperty('ecw_ratio_percent');
  });

  it('scores a heavy man low and tells him how much fat to lose', () => {
    expect(bodyComposition(HEAVY_MAN)).toMatchObject({
      body_fat_percent: 37.4,
      visceral_fat: 19.2,
      body_age: 61,
      weight_control_kg: -43.4,
      fat_control_kg: -15.2,
      body_type: 'thick_set',
      body_score: 26,
    });
  });

  it('tells a light older woman how much muscle she is short of', () => {
    expect(bodyComposition(SMALL_OLDER_WOMAN)).toMatchObject({
      body_fat_percent: 22.6,
      bone_mass_kg: 1.25,
      weight_control_kg: 8,
      muscle_control_kg: 3.2,
      body_type: 'skinny',
      body_score: 68,
    });
  });

  it('holds body fat at its floor for a very lean build', () => {
    expect(bodyComposition(LEAN_TALL_MAN)).toMatchObject({
      body_fat_percent: 5.1,
      visceral_fat: 1,
      water_percent: 69.3,
      body_age: 21,
      body_type: 'balanced_skinny',
    });
  });

  it('holds a heavy woman inside the ranges the scale can show', () => {
    expect(bodyComposition(HEAVY_WOMAN)).toMatchObject({
      body_fat_percent: 47.2,
      water_percent: 38.6,
      protein_percent: 10.3,
      body_type: 'thick_set',
      body_score: 25,
    });
  });

  it('puts every metric in a band with its own thresholds', () => {
    const { bands } = bodyComposition(FIT_MAN);
    expect(bands.bmi).toEqual({ band: 1, thresholds: [18.5, 25, 30] });
    expect(bands.body_fat_percent).toEqual({ band: 2, thresholds: [17, 22, 27] });
    expect(bands.ecw_ratio_percent).toEqual({ band: 2, thresholds: [36, 40] });
  });

  it('produces a result that satisfies its own schema for every build', () => {
    for (const input of [
      FIT_MAN,
      AVERAGE_WOMAN,
      HEAVY_MAN,
      SMALL_OLDER_WOMAN,
      LEAN_TALL_MAN,
      HEAVY_WOMAN,
    ]) {
      expect(BODY_COMPOSITION.safeParse(bodyComposition(input)).success).toBe(true);
    }
  });

  it('never gives a person more lean mass than 98 percent of their weight', () => {
    const light = bodyComposition({ ...LEAN_TALL_MAN, weightKg: 30, impedanceLow: 200 });
    expect(light.lean_mass_kg).toBeLessThanOrEqual(30 * 0.98);
  });

  it('keeps the bone mass inside half a kilo to eight kilos', () => {
    const huge = bodyComposition({ ...HEAVY_MAN, weightKg: 200, heightCm: 210 });
    expect(huge.bone_mass_kg).toBeLessThanOrEqual(8);
    const tiny = bodyComposition({ ...SMALL_OLDER_WOMAN, weightKg: 20, heightCm: 100 });
    expect(tiny.bone_mass_kg).toBeGreaterThanOrEqual(0.5);
  });

  it('clamps the muscle mass when the sum of the compartments leaves no room for fat', () => {
    const wiry = bodyComposition({ ...LEAN_TALL_MAN, weightKg: 120, impedanceLow: 200 });
    expect(wiry.muscle_mass_kg).toBeLessThanOrEqual(120);
  });

  it('differs between the sexes for the same build', () => {
    const base = { age: 35, heightCm: 170, weightKg: 70, impedanceLow: 500, impedanceHigh: null };
    const man = bodyComposition({ ...base, sex: 'male' });
    const woman = bodyComposition({ ...base, sex: 'female' });
    expect(man.body_fat_percent).not.toBe(woman.body_fat_percent);
    expect(man.ideal_weight_kg).not.toBe(woman.ideal_weight_kg);
  });
});

describe('visceral fat', () => {
  it('uses the shorter-than-weight branch for a man whose height is low for his weight', () => {
    const stocky = bodyComposition({ ...HEAVY_MAN, heightCm: 150, weightKg: 100 });
    const tall = bodyComposition({ ...HEAVY_MAN, heightCm: 190, weightKg: 100 });
    expect(stocky.visceral_fat).toBeGreaterThanOrEqual(1);
    expect(tall.visceral_fat).toBeGreaterThanOrEqual(1);
    expect(stocky.visceral_fat).not.toBe(tall.visceral_fat);
  });

  it('uses both formulas for a woman, depending on her weight against her height', () => {
    const light = bodyComposition({ ...AVERAGE_WOMAN, heightCm: 170, weightKg: 60 });
    const heavy = bodyComposition({ ...AVERAGE_WOMAN, heightCm: 150, weightKg: 90 });
    expect(light.visceral_fat).toBeGreaterThanOrEqual(1);
    expect(heavy.visceral_fat).toBeLessThanOrEqual(50);
    expect(heavy.visceral_fat).toBeGreaterThan(light.visceral_fat);
  });
});

describe('ideal weight and body mass index', () => {
  it('follows the height rules for each sex', () => {
    expect(idealWeight('male', 180)).toBe(70);
    expect(idealWeight('female', 170)).toBe(60);
  });

  it('rounds the index to one decimal and keeps it between 10 and 90', () => {
    expect(bmiOf(80, 180)).toBe(24.7);
    expect(bmiOf(1, 200)).toBe(10);
    expect(bmiOf(500, 100)).toBe(90);
  });
});

describe('choosing the two impedances', () => {
  it('takes the highest usable reading as the low-frequency one and the next as the high', () => {
    expect(impedancePair([510, 480, null, 100, 2000])).toEqual({ low: 510, high: 480 });
  });

  it('keeps a single usable reading with no second one', () => {
    expect(impedancePair([600])).toEqual({ low: 600, high: null });
  });

  it('refuses when nothing is inside the usable range', () => {
    expect(impedancePair([null])).toBeNull();
    expect(impedancePair([IMPEDANCE_RANGE.min - 1, IMPEDANCE_RANGE.max + 1])).toBeNull();
    expect(impedancePair([])).toBeNull();
  });

  it('accepts readings exactly on the edges of the range', () => {
    expect(impedancePair([IMPEDANCE_RANGE.min, IMPEDANCE_RANGE.max])).toEqual({
      low: IMPEDANCE_RANGE.max,
      high: IMPEDANCE_RANGE.min,
    });
  });
});
