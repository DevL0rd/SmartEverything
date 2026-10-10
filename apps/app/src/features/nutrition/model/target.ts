import {
  defaultAmount,
  factsOf,
  multiplierOf,
  weightOf,
  type FoodCandidate,
  type FoodRow,
  type HealthEntryRow,
  type NewFood,
} from '@smarteverything/domain';
import { mealAt, mealOfCode, type Meal } from './meals';
import { nutritionOf } from './portion';

export interface PortionTarget {
  readonly food: FoodCandidate;
  readonly foodId: string | null;
  readonly saveAs: NewFood | null;
  readonly fromOpenFoodFacts: boolean;
  readonly entry: HealthEntryRow | null;
  readonly amount: number;
  readonly multiplier: number;
  readonly meal: Meal;
  readonly at: number;
}

export function newTarget(
  food: FoodCandidate,
  source: { readonly food: FoodRow } | { readonly saveAs: NewFood },
  meal: Meal | null,
  at: number,
): PortionTarget {
  return {
    food,
    foodId: 'food' in source ? source.food.id : null,
    saveAs: 'saveAs' in source ? source.saveAs : null,
    fromOpenFoodFacts:
      ('food' in source ? source.food.origin : source.saveAs.origin) === 'open_food_facts',
    entry: null,
    amount: defaultAmount(food),
    multiplier: 1,
    meal: meal ?? mealAt(at),
    at,
  };
}

export function editTarget(
  entry: HealthEntryRow,
  saved: FoodRow | undefined,
): PortionTarget | null {
  const data = nutritionOf(entry);
  const portion = entry.food;
  if (data === null || portion === null) {
    return null;
  }
  const waterPercent =
    portion.unit === 'ml' ? Math.min(100, Math.round((portion.waterMl / portion.amount) * 100)) : 0;
  const snapshot: FoodCandidate = {
    name: portion.name,
    brand: null,
    barcode: null,
    kind: portion.unit === 'ml' ? 'drink' : 'food',
    basis: { amount: portion.amount, unit: portion.unit },
    serving: null,
    kcal: data.kilocalories,
    grams: data.grams,
    water_percent: waterPercent,
  };
  return {
    food: saved === undefined ? snapshot : factsOf(saved),
    foodId: portion.foodId,
    saveAs: null,
    fromOpenFoodFacts: saved?.origin === 'open_food_facts',
    entry,
    amount: weightOf(portion),
    multiplier: multiplierOf(portion),
    meal: mealOfCode(data.mealType) ?? 'snack',
    at: Date.parse(entry.start_time),
  };
}
