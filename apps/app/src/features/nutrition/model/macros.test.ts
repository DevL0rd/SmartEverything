import { describe, expect, it } from 'vitest';
import type { NutritionPref } from '@smarteverything/domain';
import { MACROS, NUTRIENT_MACROS, amountText, goalOf, hasAnyGoal, type MacroInfo } from './macros';

const NO_GOALS: NutritionPref = {
  energyKcal: null,
  proteinG: null,
  carbohydrateG: null,
  fatG: null,
  glassMl: 250,
};

function macro(key: string): MacroInfo {
  const found = MACROS.find((item) => item.key === key);
  if (found === undefined) {
    throw new Error(key);
  }
  return found;
}

describe('amountText', () => {
  it('rounds calories to whole numbers', () => {
    expect(amountText(1234.6, 'kcal')).toBe('1,235');
    expect(amountText(0, 'kcal')).toBe('0');
  });

  it('keeps one decimal below ten grams and drops a trailing zero', () => {
    expect(amountText(4.25, 'g')).toBe('4.3');
    expect(amountText(4.0, 'g')).toBe('4');
    expect(amountText(0.04, 'g')).toBe('0');
  });

  it('rounds ten grams and more to whole numbers', () => {
    expect(amountText(10, 'g')).toBe('10');
    expect(amountText(99.5, 'g')).toBe('100');
  });
});

describe('goals', () => {
  it('reads the goal of each macro from the preferences', () => {
    const prefs = { ...NO_GOALS, proteinG: 120, energyKcal: 2200 };
    expect(goalOf(prefs, macro('protein'))).toBe(120);
    expect(goalOf(prefs, macro('energy'))).toBe(2200);
    expect(goalOf(prefs, macro('fat'))).toBeNull();
  });

  it('has a goal as soon as one macro has one', () => {
    expect(hasAnyGoal(NO_GOALS)).toBe(false);
    expect(hasAnyGoal({ ...NO_GOALS, fatG: 70 })).toBe(true);
  });

  it('leaves energy out of the nutrient macros', () => {
    expect(NUTRIENT_MACROS.map((item) => item.key)).toEqual(['protein', 'carbohydrate', 'fat']);
  });
});
