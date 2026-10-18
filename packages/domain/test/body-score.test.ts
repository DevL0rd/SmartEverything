import { describe, expect, it } from 'vitest';
import { BODY_TYPES, bodyScore, bodyTypeOf } from '../src/body-score';
import type { Compartments, CompositionInput } from '../src/body-types';

const MAN: CompositionInput = {
  sex: 'male',
  age: 35,
  heightCm: 180,
  weightKg: 75,
  impedanceLow: 480,
  impedanceHigh: null,
};

const HEALTHY: Compartments = {
  lean: 62,
  fatPercent: 15,
  fatMass: 11,
  waterPercent: 58,
  bone: 3,
  muscle: 55,
  skeletal: 40,
  protein: 19,
  visceral: 5,
  bmr: 1800,
};

function parts(overrides: Partial<Compartments>): Compartments {
  return { ...HEALTHY, ...overrides };
}

describe('body type', () => {
  const cases: readonly (readonly [string, number, number, (typeof BODY_TYPES)[number]])[] = [
    ['a lot of fat and little muscle', 30, 40, 'obese'],
    ['a lot of fat and ordinary muscle', 30, 55, 'overweight'],
    ['a lot of fat and a lot of muscle', 30, 65, 'thick_set'],
    ['ordinary fat and little muscle', 19, 40, 'lack_exercise'],
    ['ordinary fat and ordinary muscle', 19, 55, 'balanced'],
    ['ordinary fat and a lot of muscle', 19, 65, 'balanced_muscular'],
    ['little fat and little muscle', 10, 40, 'skinny'],
    ['little fat and ordinary muscle', 10, 55, 'balanced_skinny'],
    ['little fat and a lot of muscle', 10, 65, 'skinny_muscular'],
  ];

  it.each(cases)('is read from %s', (_name, fatPercent, muscle, expected) => {
    expect(bodyTypeOf(MAN, parts({ fatPercent, muscle }))).toBe(expected);
  });

  it('can name every type the schema allows', () => {
    const named = new Set(cases.map(([, , , type]) => type));
    expect([...named].sort()).toEqual([...BODY_TYPES].sort());
  });

  it('treats a value exactly on a limit as the middle band', () => {
    expect(bodyTypeOf(MAN, parts({ fatPercent: 22, muscle: 59.5 }))).toBe('balanced');
    expect(bodyTypeOf(MAN, parts({ fatPercent: 17, muscle: 49.4 }))).toBe('balanced');
  });
});

describe('body score', () => {
  it('gives a healthy build full marks', () => {
    expect(bodyScore(MAN, HEALTHY)).toBe(100);
  });

  it('never goes above 100 or below 10', () => {
    const wrecked = parts({
      fatPercent: 60,
      visceral: 30,
      protein: 5,
      bmr: 100,
      skeletal: 1,
      waterPercent: 30,
      bone: 0.5,
    });
    expect(bodyScore({ ...MAN, weightKg: 40 }, wrecked)).toBe(10);
    expect(bodyScore(MAN, HEALTHY)).toBeLessThanOrEqual(100);
  });

  it('takes points off for too much fat, more the more there is', () => {
    const high = bodyScore(MAN, parts({ fatPercent: 20 }));
    const higher = bodyScore(MAN, parts({ fatPercent: 24 }));
    const highest = bodyScore(MAN, parts({ fatPercent: 30 }));
    expect(high).toBeLessThan(100);
    expect(higher).toBeLessThan(high);
    expect(highest).toBeLessThan(higher);
  });

  it('takes points off for too little fat', () => {
    expect(bodyScore(MAN, parts({ fatPercent: 5 }))).toBeLessThan(
      bodyScore(MAN, parts({ fatPercent: 9 })),
    );
    expect(bodyScore(MAN, parts({ fatPercent: 9 }))).toBeLessThan(100);
  });

  it('takes no points off for fat below the best range but above the lean floor', () => {
    expect(bodyScore(MAN, parts({ fatPercent: 12 }))).toBe(100);
  });

  it('penalises visceral fat from ten up and not below', () => {
    expect(bodyScore(MAN, parts({ visceral: 9 }))).toBe(100);
    expect(bodyScore(MAN, parts({ visceral: 10 }))).toBeLessThan(100);
    expect(bodyScore(MAN, parts({ visceral: 15 }))).toBeLessThan(
      bodyScore(MAN, parts({ visceral: 10 })),
    );
  });

  it('penalises low protein in two steps', () => {
    const very = bodyScore(MAN, parts({ protein: 12 }));
    const slightly = bodyScore(MAN, parts({ protein: 16.5 }));
    expect(very).toBeLessThan(slightly);
    expect(slightly).toBeLessThan(100);
    expect(bodyScore(MAN, parts({ protein: 18 }))).toBe(100);
  });

  it('penalises water, bone and metabolism below their normal', () => {
    expect(bodyScore(MAN, parts({ waterPercent: 52 }))).toBeLessThan(100);
    expect(bodyScore(MAN, parts({ bone: 1.8 }))).toBeLessThan(100);
    expect(bodyScore(MAN, parts({ bmr: 1500 }))).toBeLessThan(100);
  });

  it('penalises low skeletal muscle but ignores a missing reading', () => {
    expect(bodyScore(MAN, parts({ skeletal: 25 }))).toBeLessThan(100);
    expect(bodyScore(MAN, parts({ skeletal: 0 }))).toBe(100);
  });

  it('penalises a body mass index that is very low or low', () => {
    const veryLow = bodyScore({ ...MAN, weightKg: 45 }, HEALTHY);
    const low = bodyScore({ ...MAN, weightKg: 56 }, HEALTHY);
    expect(veryLow).toBeLessThan(low);
    expect(low).toBeLessThan(100);
  });

  it('penalises a high body mass index only when the fat is high too', () => {
    const heavy = { ...MAN, weightKg: 100 };
    const strong = parts({ fatPercent: 15, bmr: 2200 });
    const fat = parts({ fatPercent: 22.5, bmr: 2200 });
    expect(bodyScore(heavy, strong)).toBe(100);
    expect(bodyScore(heavy, fat)).toBeLessThan(bodyScore({ ...MAN, weightKg: 75 }, fat));
  });

  it('forgives a low index in a young person whose fat is not high', () => {
    const teen = { ...MAN, age: 16, weightKg: 56 };
    const adult = { ...MAN, age: 30, weightKg: 56 };
    expect(bodyScore(teen, HEALTHY)).toBeGreaterThan(bodyScore(adult, HEALTHY));
  });

  it('does not judge the index of a child under ninety centimetres', () => {
    const infant = { ...MAN, age: 1, heightCm: 80, weightKg: 30 };
    expect(bodyScore(infant, parts({ fatPercent: 20 }))).toBe(
      bodyScore({ ...infant, weightKg: 10 }, parts({ fatPercent: 20 })),
    );
  });
});
