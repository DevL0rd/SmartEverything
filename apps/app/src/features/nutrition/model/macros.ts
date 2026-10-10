import type {
  HealthMetric,
  Nutrient,
  NutritionGoalKey,
  NutritionPref,
} from '@smarteverything/domain';
import type { ColourRole } from '../../../design/tokens';

type MacroKey = 'energy' | 'protein' | 'carbohydrate' | 'fat';

export interface MacroInfo {
  readonly key: MacroKey;
  readonly label: string;
  readonly short: string;
  readonly metric: HealthMetric;
  readonly nutrient: Nutrient | null;
  readonly goal: NutritionGoalKey;
  readonly unit: string;
  readonly colour: ColourRole;
  readonly dot: string;
}

export const MACROS: readonly MacroInfo[] = [
  {
    key: 'energy',
    label: 'Calories',
    short: 'kcal',
    metric: 'energy_in',
    nutrient: null,
    goal: 'energyKcal',
    unit: 'kcal',
    colour: 'viz-2',
    dot: 'bg-viz-2',
  },
  {
    key: 'protein',
    label: 'Protein',
    short: 'P',
    metric: 'protein',
    nutrient: 'protein',
    goal: 'proteinG',
    unit: 'g',
    colour: 'viz-4',
    dot: 'bg-viz-4',
  },
  {
    key: 'carbohydrate',
    label: 'Carbs',
    short: 'C',
    metric: 'carbohydrate',
    nutrient: 'totalCarbohydrate',
    goal: 'carbohydrateG',
    unit: 'g',
    colour: 'viz-3',
    dot: 'bg-viz-3',
  },
  {
    key: 'fat',
    label: 'Fat',
    short: 'F',
    metric: 'fat',
    nutrient: 'totalFat',
    goal: 'fatG',
    unit: 'g',
    colour: 'viz-5',
    dot: 'bg-viz-5',
  },
];

export const NUTRIENT_MACROS: readonly MacroInfo[] = MACROS.filter(
  (macro) => macro.key !== 'energy',
);

export function goalOf(prefs: NutritionPref, macro: MacroInfo): number | null {
  return prefs[macro.goal];
}

export function hasAnyGoal(prefs: NutritionPref): boolean {
  return MACROS.some((macro) => goalOf(prefs, macro) !== null);
}

export function amountText(value: number, unit: string): string {
  if (unit === 'kcal') {
    return Math.round(value).toLocaleString();
  }
  return value < 10 ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value));
}
