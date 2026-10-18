import { describe, expect, it } from 'vitest';
import { codeOfMeal, isMeal, mealAt, mealOfCode } from './meals';

function at(hour: number): number {
  return new Date(2026, 9, 16, hour, 30).getTime();
}

describe('mealAt', () => {
  it.each([
    [3, 'snack'],
    [4, 'breakfast'],
    [10, 'breakfast'],
    [11, 'lunch'],
    [14, 'lunch'],
    [15, 'snack'],
    [16, 'snack'],
    [17, 'dinner'],
    [21, 'dinner'],
    [22, 'snack'],
    [0, 'snack'],
  ])('names the meal eaten at %i:30 %s', (hour, meal) => {
    expect(mealAt(at(hour))).toBe(meal);
  });
});

describe('meal codes', () => {
  it('maps a stored meal code to its meal and back', () => {
    expect(mealOfCode(1)).toBe('breakfast');
    expect(mealOfCode(4)).toBe('snack');
    expect(codeOfMeal('dinner')).toBe(3);
  });

  it('has no meal for the unknown code or a code that does not exist', () => {
    expect(mealOfCode(0)).toBeNull();
    expect(mealOfCode(9)).toBeNull();
  });

  it('accepts only the four meal names', () => {
    expect(isMeal('lunch')).toBe(true);
    expect(isMeal('brunch')).toBe(false);
    expect(isMeal(undefined)).toBe(false);
  });
});
