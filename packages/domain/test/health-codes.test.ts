import { describe, expect, it } from 'vitest';
import { HC_CODES, MEAL_TYPES, SLEEP_STAGE_KINDS, hcEntry, hcLabel, type HcCode } from '../src';

const ALL_TABLES: readonly (readonly [string, readonly HcCode[]])[] = Object.entries(HC_CODES);

function resultsByLabel(): Readonly<Record<string, number>> {
  return Object.fromEntries(HC_CODES.ovulationResult.map(({ code, label }) => [label, code]));
}

describe('Health Connect code tables', () => {
  it.each(ALL_TABLES)('%s has no repeated code or label', (_name, codes) => {
    expect(new Set(codes.map(({ code }) => code)).size).toBe(codes.length);
    expect(new Set(codes.map(({ label }) => label)).size).toBe(codes.length);
  });

  it('pairs ovulation results with the Health Connect values', () => {
    expect(resultsByLabel()).toEqual({ Inconclusive: 0, Positive: 1, High: 2, Negative: 3 });
  });

  it('offers the ovulation results in picker order', () => {
    expect(HC_CODES.ovulationResult.map(({ short }) => short)).toEqual([
      'Positive',
      'High',
      'Negative',
      'Inconclusive',
    ]);
  });

  it('labels flow in summaries and in pickers differently', () => {
    expect(HC_CODES.flow.map(({ label }) => label)).toEqual([
      'Unknown flow',
      'Light flow',
      'Medium flow',
      'Heavy flow',
    ]);
    expect(HC_CODES.flow.map(({ short }) => short)).toEqual([
      'Not set',
      'Light',
      'Medium',
      'Heavy',
    ]);
    expect(HC_CODES.sensation.map(({ label }) => label)).toEqual([
      'Not set',
      'Light',
      'Medium',
      'Heavy',
    ]);
  });

  it('takes meal codes from the entry meal types', () => {
    expect(HC_CODES.mealType.map(({ code }) => code)).toEqual(Object.values(MEAL_TYPES));
    expect(hcLabel(HC_CODES.mealType, MEAL_TYPES.dinner)).toBe('Dinner');
  });

  it('names exercise types by Health Connect code', () => {
    expect(hcEntry(HC_CODES.exerciseType, 79)?.label).toBe('Walking');
    expect(hcEntry(HC_CODES.exerciseType, 1234)).toBeUndefined();
  });

  it('names an unknown code by its number', () => {
    expect(hcLabel(HC_CODES.flow, 9)).toBe('Code 9');
  });

  it('maps every sleep stage code to a kind', () => {
    expect(Object.keys(SLEEP_STAGE_KINDS)).toHaveLength(8);
    expect(SLEEP_STAGE_KINDS[6]).toBe('rem');
  });
});
