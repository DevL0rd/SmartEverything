import { MEAL_TYPES, MEALS, type MealType } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';

export type Meal = (typeof MEALS)[number];

export const MEAL_INFO: Readonly<
  Record<Meal, { readonly label: string; readonly icon: IconName }>
> = {
  breakfast: { label: 'Breakfast', icon: 'croissant' },
  lunch: { label: 'Lunch', icon: 'sandwich' },
  dinner: { label: 'Dinner', icon: 'utensils' },
  snack: { label: 'Snacks', icon: 'cookie' },
};

export function mealOfCode(code: number): Meal | null {
  return MEALS.find((meal) => MEAL_TYPES[meal] === code) ?? null;
}

export function codeOfMeal(meal: MealType): number {
  return MEAL_TYPES[meal];
}

export function mealAt(moment: number): Meal {
  const hour = new Date(moment).getHours();
  if (hour >= 4 && hour < 11) {
    return 'breakfast';
  }
  if (hour >= 11 && hour < 15) {
    return 'lunch';
  }
  if (hour >= 17 && hour < 22) {
    return 'dinner';
  }
  return 'snack';
}

export function isMeal(value: string | undefined): value is Meal {
  return MEALS.some((meal) => meal === value);
}
