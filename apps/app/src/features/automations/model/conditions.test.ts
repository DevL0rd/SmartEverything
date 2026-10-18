import { describe, expect, it } from 'vitest';
import {
  compareOperators,
  conditionOfGroup,
  defaultCompareTest,
  isCompareTest,
  rootGroup,
} from './conditions';
import { betweenFrom, betweenTo, testFor, seedOf } from './capability-choices';
import { lamp, purifier } from './test-devices';

const NIGHT = { daylight: 'night' } as const;
const DAY = { daylight: 'day' } as const;

describe('the Only if group', () => {
  it('reads no condition as an empty all-group and a lone condition as a one-item group', () => {
    expect(rootGroup(undefined)).toEqual({ mode: 'all', items: [] });
    expect(rootGroup(NIGHT)).toEqual({ mode: 'all', items: [NIGHT] });
    expect(rootGroup({ any: [NIGHT, DAY] })).toEqual({ mode: 'any', items: [NIGHT, DAY] });
  });

  it('stores an empty group as no condition and keeps all or any otherwise', () => {
    expect(conditionOfGroup({ mode: 'all', items: [] })).toBeUndefined();
    expect(conditionOfGroup({ mode: 'any', items: [NIGHT, DAY] })).toEqual({ any: [NIGHT, DAY] });
    expect(conditionOfGroup({ mode: 'all', items: [NIGHT] })).toEqual({ all: [NIGHT] });
  });
});

describe('comparing a reading', () => {
  const power = lamp.capabilities.find((entry) => entry.key === 'power');
  const pm25 = purifier.capabilities.find((entry) => entry.key === 'pm25');
  if (power === undefined || pm25 === undefined) throw new Error('Fixture capabilities exist');

  it('offers only the comparisons that suit the kind of reading', () => {
    expect(compareOperators({ type: 'reading', device: lamp, capability: power })).toEqual([
      'eq',
      'ne',
    ]);
    expect(compareOperators({ type: 'reading', device: purifier, capability: pm25 })).toContain(
      'between',
    );
    expect(compareOperators({ type: 'weather', metric: 'temperature' })).not.toContain('eq');
  });

  it('starts a number at "above its lowest" and a switch at "is on"', () => {
    expect(defaultCompareTest({ type: 'reading', device: purifier, capability: pm25 })).toEqual({
      is: 'gt',
      to: 0,
    });
    expect(defaultCompareTest({ type: 'reading', device: lamp, capability: power })).toEqual({
      is: 'eq',
      to: true,
    });
  });

  it('never lets a plain condition use "changed"', () => {
    expect(isCompareTest({ is: 'changed' })).toBe(false);
    expect(isCompareTest({ is: 'gt', to: 1 })).toBe(true);
  });

  it('keeps From at or below To when either end moves, so both fields stay in sync', () => {
    const range = { is: 'between', min: 10, max: 20 } as const;
    expect(betweenFrom(range, 30)).toEqual({ is: 'between', min: 30, max: 30 });
    expect(betweenTo(range, 5)).toEqual({ is: 'between', min: 5, max: 5 });
    expect(betweenFrom(range, 15)).toEqual({ is: 'between', min: 15, max: 20 });
  });

  it('carries the value over when the comparison changes', () => {
    const seed = seedOf(pm25.value);
    expect(testFor('gte', seed, { is: 'eq', to: 40 })).toEqual({ is: 'gte', to: 40 });
    expect(testFor('between', seed, { is: 'gt', to: 40 })).toEqual({
      is: 'between',
      min: 40,
      max: 600,
    });
    expect(testFor('changed', seed)).toEqual({ is: 'changed' });
  });
});
