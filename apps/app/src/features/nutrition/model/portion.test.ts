import { describe, expect, it } from 'vitest';
import type { FoodCandidate, HealthEntryInput, HealthEntryRow } from '@smarteverything/domain';
import { entryOfFood, nutritionOf, waterEntry, waterMlOfEntry } from './portion';

const AT = Date.parse('2026-10-16T12:00:00Z');

const BREAD: FoodCandidate = {
  name: 'Bread',
  brand: null,
  barcode: null,
  kind: 'food',
  basis: { amount: 100, unit: 'g' },
  serving: { amount: 40, label: 'slice' },
  kcal: 250,
  grams: { protein: 8 },
  water_percent: 35,
};

function rowOf(input: HealthEntryInput): HealthEntryRow {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    profile_id: '00000000-0000-4000-8000-000000000002',
    record_type: input.type,
    start_time: input.startTime,
    end_time: input.endTime,
    zone_offset_seconds: input.zoneOffsetSeconds,
    data: input.data,
    food: input.food,
    version: 1,
    save_error: null,
    created_at: input.startTime,
    updated_at: input.startTime,
  };
}

describe('entryOfFood', () => {
  it('scales calories and nutrients to the amount eaten', () => {
    const entry = entryOfFood({
      food: BREAD,
      foodId: null,
      amount: 80,
      meal: 'lunch',
      at: AT,
    });
    expect(entry.type).toBe('Nutrition');
    expect(entry.data['kilocalories']).toBe(200);
    expect(entry.data['grams']).toEqual({ protein: 6.4 });
    expect(entry.data['mealType']).toBe(2);
    expect(entry.food).toMatchObject({ amount: 80, unit: 'g', label: '2 × slice', waterMl: 28 });
  });

  it('records the amount eaten without a multiplier', () => {
    const entry = entryOfFood({ food: BREAD, foodId: null, amount: 80, meal: 'snack', at: AT });
    expect(entry.food).not.toHaveProperty('multiplier');
    expect(entry.food?.amount).toBe(80);
  });
});

describe('water', () => {
  it('logs water as litres over one minute', () => {
    const entry = waterEntry(300, AT);
    expect(entry.type).toBe('Hydration');
    expect(entry.data).toEqual({ liters: 0.3 });
    expect(entry.endTime).toBe('2026-10-16T12:01:00.000Z');
  });

  it('counts the water of a hydration entry in millilitres', () => {
    expect(waterMlOfEntry(rowOf(waterEntry(330, AT)))).toBe(330);
  });

  it('counts the water inside a food entry and none for an entry without a portion', () => {
    const food = entryOfFood({
      food: BREAD,
      foodId: null,
      amount: 100,
      meal: 'lunch',
      at: AT,
    });
    expect(waterMlOfEntry(rowOf(food))).toBe(35);
    expect(waterMlOfEntry({ ...rowOf(food), food: null })).toBe(0);
  });
});

describe('nutritionOf', () => {
  it('reads the nutrition of a food entry and nothing from a hydration entry', () => {
    const food = entryOfFood({
      food: BREAD,
      foodId: null,
      amount: 100,
      meal: 'lunch',
      at: AT,
    });
    expect(nutritionOf(rowOf(food))?.kilocalories).toBe(250);
    expect(nutritionOf(rowOf(waterEntry(100, AT)))).toBeNull();
  });
});
