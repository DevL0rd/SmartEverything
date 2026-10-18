import {
  entryRecord,
  foodEntryOf,
  waterEntryOf,
  type FoodCandidate,
  type HealthEntryInput,
  type HealthEntryRow,
  type HealthRecord,
} from '@smarteverything/domain';
import { codeOfMeal, type Meal } from './meals';
import { entrySpan } from './day';

export interface FoodLog {
  readonly food: FoodCandidate;
  readonly foodId: string | null;
  readonly amount: number;
  readonly meal: Meal;
  readonly at: number;
}

export function entryOfFood({ food, foodId, amount, meal, at }: FoodLog): HealthEntryInput {
  return foodEntryOf({
    food,
    foodId,
    amount,
    mealType: codeOfMeal(meal),
    span: entrySpan(at),
  });
}

export function waterEntry(millilitres: number, at: number): HealthEntryInput {
  return waterEntryOf(millilitres, entrySpan(at));
}

export function waterMlOfEntry(entry: HealthEntryRow): number {
  const record = entryRecord(entry);
  if (record.type === 'Hydration') {
    return Math.round(record.data.liters * 1000);
  }
  return entry.food === null ? 0 : entry.food.waterMl;
}

export function nutritionOf(entry: HealthEntryRow): NutritionData | null {
  const record = entryRecord(entry);
  return record.type === 'Nutrition' ? record.data : null;
}

export type NutritionData = Extract<HealthRecord, { type: 'Nutrition' }>['data'];
