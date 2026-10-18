import { describe, expect, it } from 'vitest';
import {
  HEALTH_ENTRY_ROW,
  type FoodCandidate,
  type HealthEntryRow,
  type NewFood,
} from '@smarteverything/domain';
import { blankForm, checkForm, withKind, type FoodForm } from './food-form';
import { entryOfFood } from './portion';
import { editTarget } from './target';

const ID = '11111111-1111-4111-8111-111111111111';

function filled(kind: 'food' | 'drink', waterPercent: number): FoodForm {
  return {
    ...withKind(blankForm('Thing', ''), kind),
    kcal: '100',
    waterPercent,
  };
}

function savedFood(form: FoodForm): NewFood {
  const check = checkForm(form, 'custom');
  if (!check.ok) {
    throw new Error('form should be valid');
  }
  return check.food;
}

function rowOf(candidate: FoodCandidate): HealthEntryRow {
  const input = entryOfFood({
    food: candidate,
    foodId: null,
    amount: 100,
    meal: 'snack',
    at: Date.parse('2026-10-16T12:00:00.000Z'),
  });
  return HEALTH_ENTRY_ROW.parse({
    data: input.data,
    food: input.food,
    id: ID,
    profile_id: ID,
    record_type: input.type,
    start_time: input.startTime,
    end_time: input.endTime,
    zone_offset_seconds: input.zoneOffsetSeconds,
    version: 1,
    created_at: input.startTime,
    updated_at: input.startTime,
  });
}

describe('water share only counts for drinks', () => {
  it('saves a solid food with no water share even if the form carries one', () => {
    expect(savedFood(filled('food', 30)).water_percent).toBe(0);
  });

  it('keeps the water share of a drink', () => {
    expect(savedFood(filled('drink', 90)).water_percent).toBe(90);
  });

  it('reopens a logged solid food with no water share', () => {
    const solid: FoodCandidate = { ...savedFood(filled('food', 0)), water_percent: 30 };
    const target = editTarget(rowOf(solid), undefined);
    expect(target?.food.water_percent).toBe(0);
  });

  it('reopens a logged drink with its water share', () => {
    const drink = savedFood(filled('drink', 90));
    const target = editTarget(rowOf(drink), undefined);
    expect(target?.food.water_percent).toBe(90);
  });
});
