import { portionOf, type FoodCandidate, type FoodRow } from './foods';
import type { HealthEntryInput } from './health-entries';

export interface EntrySpan {
  readonly startTime: string;
  readonly endTime: string;
  readonly zoneOffsetSeconds: number;
}

export function factsOf(food: FoodRow): FoodCandidate {
  return {
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    kind: food.kind,
    basis: food.basis,
    serving: food.serving,
    kcal: food.kcal,
    grams: food.grams,
    water_percent: food.water_percent,
  };
}

export function defaultAmount(food: FoodCandidate): number {
  if (food.serving !== null) {
    return food.serving.amount;
  }
  return food.kind === 'drink' ? 250 : 100;
}

function trimmed(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function portionLabel(food: FoodCandidate, amount: number): string {
  const serving = food.serving;
  if (serving !== null && amount === serving.amount) {
    return serving.label;
  }
  if (serving !== null && amount % serving.amount === 0) {
    return `${trimmed(amount / serving.amount)} × ${serving.label}`;
  }
  return `${trimmed(amount)} ${food.basis.unit}`;
}

export interface FoodLog {
  readonly food: FoodCandidate;
  readonly foodId: string | null;
  readonly amount: number;
  readonly mealType: number;
  readonly span: EntrySpan;
}

export function foodEntryOf({ food, foodId, amount, mealType, span }: FoodLog): HealthEntryInput {
  const portion = portionOf(food, amount);
  return {
    type: 'Nutrition',
    ...span,
    data: {
      name: food.name,
      mealType,
      kilocalories: portion.kilocalories,
      kilocaloriesFromFat: null,
      grams: portion.grams,
    },
    food: {
      foodId,
      name: food.name,
      amount,
      unit: food.basis.unit,
      label: portionLabel(food, amount),
      waterMl: portion.waterMl,
    },
  };
}

export function waterEntryOf(millilitres: number, span: EntrySpan): HealthEntryInput {
  return {
    type: 'Hydration',
    ...span,
    data: { liters: millilitres / 1000 },
    food: null,
  };
}
