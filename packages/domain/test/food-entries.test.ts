import { describe, expect, it } from 'vitest';
import { FOOD_PORTION, foodEntryOf, waterEntryOf, type FoodCandidate } from '../src';

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

function log(amount: number): ReturnType<typeof foodEntryOf> {
  return foodEntryOf({ food: CRISPS, foodId: null, amount, mealType: 4, span: SPAN });
}

describe('foodEntryOf', () => {
  it('records the amount eaten once, without a multiplier', () => {
    const entry = log(100);
    expect(entry.data['kilocalories']).toBe(500);
    expect(entry.food?.amount).toBe(100);
    expect(entry.food).not.toHaveProperty('multiplier');
  });

  it('prices a larger amount directly', () => {
    const entry = log(250);
    expect(entry.food?.amount).toBe(250);
    expect(entry.data['kilocalories']).toBe(1250);
  });

  it('still reads entries stored with a multiplier', () => {
    const portion = FOOD_PORTION.parse({ ...log(100).food, amount: 375, multiplier: 1.5 });
    expect(portion.amount).toBe(375);
    expect(portion.multiplier).toBe(1.5);
    expect(() => FOOD_PORTION.parse({ ...portion, amount: 200_000, multiplier: 20 })).not.toThrow();
  });
});

describe('waterEntryOf', () => {
  it('converts the millilitres to litres', () => {
    expect(waterEntryOf(250, SPAN).data['liters']).toBe(0.25);
  });
});
