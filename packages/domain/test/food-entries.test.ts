import { describe, expect, it } from 'vitest';
import {
  FOOD_PORTION,
  foodEntryOf,
  multiplierOf,
  scaledAmount,
  waterEntryOf,
  weightOf,
  type FoodCandidate,
} from '../src';

const SPAN = {
  startTime: '2026-10-10T12:00:00.000Z',
  endTime: '2026-10-10T12:01:00.000Z',
  zoneOffsetSeconds: 25_200,
};

const CRISPS: FoodCandidate = {
  name: 'Crisps',
  brand: null,
  barcode: null,
  kind: 'food',
  basis: { amount: 100, unit: 'g' },
  serving: null,
  kcal: 500,
  grams: { protein: 6 },
  water_percent: 0,
};

function log(amount: number, multiplier?: number): ReturnType<typeof foodEntryOf> {
  return foodEntryOf({ food: CRISPS, foodId: null, amount, multiplier, mealType: 4, span: SPAN });
}

describe('scaledAmount', () => {
  it.each([
    [200, 0.5, 100],
    [200, 1, 200],
    [100, 1.2, 120],
    [150, 2, 300],
  ])('scales %f by %f to %f', (weight, multiplier, expected) => {
    expect(scaledAmount(weight, multiplier)).toBe(expected);
  });

  it.each([0, -1, 0.05, 21, Number.NaN, Number.POSITIVE_INFINITY])('rejects %f', (multiplier) => {
    expect(() => scaledAmount(100, multiplier)).toThrow();
  });
});

describe('foodEntryOf', () => {
  it('counts the portion once, as the scaled amount', () => {
    const half = log(200, 0.5);
    expect(half.data['kilocalories']).toBe(500);
    expect(half.food?.amount).toBe(100);
    expect(half.food?.multiplier).toBe(0.5);
    expect(half.data['kilocalories']).toBe(log(100).data['kilocalories']);
  });

  it('leaves the multiplier out when it is 1 or not given', () => {
    expect(log(100).food?.multiplier).toBeUndefined();
    expect(log(100, 1).food?.multiplier).toBeUndefined();
  });

  it('keeps what the person typed recoverable for editing', () => {
    const entry = log(250, 1.5);
    const portion = FOOD_PORTION.parse(entry.food);
    expect(portion.amount).toBe(375);
    expect(weightOf(portion)).toBe(250);
    expect(multiplierOf(portion)).toBe(1.5);
    expect(multiplierOf(null)).toBe(1);
  });

  it('accepts the largest amount with the largest multiplier', () => {
    expect(() => FOOD_PORTION.parse(log(10_000, 20).food)).not.toThrow();
  });
});

describe('waterEntryOf', () => {
  it('scales the millilitres once', () => {
    expect(waterEntryOf(250, SPAN, 0.5).data['liters']).toBe(0.125);
    expect(waterEntryOf(250, SPAN).data['liters']).toBe(0.25);
  });
});
