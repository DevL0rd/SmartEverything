import { describe, expect, it } from 'vitest';
import type { FoodCandidate, FoodRow, HealthEntryRow, NewFood } from '@smarteverything/domain';
import { entryOfFood, waterEntry } from './portion';
import { editTarget, newTarget } from './target';

const AT = new Date(2026, 9, 16, 8, 15).getTime();

const COFFEE: FoodCandidate = {
  name: 'Coffee',
  brand: null,
  barcode: null,
  kind: 'drink',
  basis: { amount: 100, unit: 'ml' },
  serving: null,
  kcal: 2,
  grams: {},
  water_percent: 98,
};

const SAVED: FoodRow = {
  ...COFFEE,
  id: '00000000-0000-4000-8000-000000000009',
  profile_id: '00000000-0000-4000-8000-000000000002',
  origin: 'open_food_facts',
  favourite: false,
  last_used_at: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

const NEW: NewFood = { ...COFFEE, origin: 'custom', favourite: false };

function loggedRow(foodId: string | null): HealthEntryRow {
  const input = entryOfFood({
    food: COFFEE,
    foodId,
    amount: 200,
    meal: 'dinner',
    at: AT,
  });
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
    source: null,
    created_at: input.startTime,
    updated_at: input.startTime,
  };
}

describe('newTarget', () => {
  it('starts a saved food on its default amount, once, in the meal of the hour', () => {
    const target = newTarget(COFFEE, { food: SAVED }, null, AT);
    expect(target).toMatchObject({
      foodId: SAVED.id,
      saveAs: null,
      amount: 250,
      meal: 'breakfast',
      entry: null,
      fromOpenFoodFacts: true,
    });
  });

  it('keeps a chosen meal and carries a food that is not saved yet', () => {
    const target = newTarget(COFFEE, { saveAs: NEW }, 'dinner', AT);
    expect(target.meal).toBe('dinner');
    expect(target.foodId).toBeNull();
    expect(target.saveAs).toBe(NEW);
    expect(target.fromOpenFoodFacts).toBe(false);
  });
});

describe('editTarget', () => {
  it('restores the amount, meal and time of a logged food', () => {
    const target = editTarget(loggedRow(SAVED.id), SAVED);
    expect(target).toMatchObject({
      foodId: SAVED.id,
      amount: 200,
      meal: 'dinner',
      fromOpenFoodFacts: true,
    });
    expect(target?.at).toBe(AT);
  });

  it('edits an entry stored with a multiplier by the total amount eaten', () => {
    const row = loggedRow(SAVED.id);
    const legacy =
      row.food === null ? row : { ...row, food: { ...row.food, amount: 400, multiplier: 2 } };
    const target = editTarget(legacy, SAVED);
    expect(target?.amount).toBe(400);
    expect(target).not.toHaveProperty('multiplier');
  });

  it('uses the facts of the saved food when it still exists', () => {
    expect(editTarget(loggedRow(SAVED.id), SAVED)?.food.name).toBe('Coffee');
  });

  it('rebuilds the food from the logged portion when the saved food is gone', () => {
    const target = editTarget(loggedRow(null), undefined);
    expect(target?.food).toMatchObject({
      name: 'Coffee',
      kind: 'drink',
      basis: { amount: 200, unit: 'ml' },
      water_percent: 98,
    });
    expect(target?.fromOpenFoodFacts).toBe(false);
  });

  it('has nothing to edit for an entry without a food portion', () => {
    const water = loggedRow(null);
    const hydration = waterEntry(250, AT);
    expect(
      editTarget(
        { ...water, record_type: 'Hydration', data: hydration.data, food: null },
        undefined,
      ),
    ).toBeNull();
  });
});
