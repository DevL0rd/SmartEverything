import { createElement } from 'react';
import {
  GLASS_SIZES,
  NUTRITION_GOAL_KEYS,
  NUTRITION_GOAL_LIMITS,
  type NutritionGoalKey,
} from '@smarteverything/domain';
import { href } from '../../app-shell/hrefs';
import type { StoreState } from '../../store/state';
import { waterGoalIn } from './data/water-goal';
import type { SettingDefinition, SettingEnv } from '../../settings/types';
import { nutritionPrefsOf, nutritionReady, saveNutritionPrefs } from './data/prefs';
import { EntryWritesRow } from './settings-rows/entry-writes-row';
import { GoalRow } from './settings-rows/goal-row';
import { litres, millilitres } from '../../format/number';

const KEYWORDS: Readonly<Record<NutritionGoalKey, readonly string[]>> = {
  energyKcal: ['calories', 'kcal', 'energy', 'diet', 'goal'],
  proteinG: ['protein', 'macros', 'goal'],
  carbohydrateG: ['carbs', 'carbohydrate', 'macros', 'goal'],
  fatG: ['fat', 'macros', 'goal'],
};

function goalSetting(goal: NutritionGoalKey): SettingDefinition {
  return {
    id: `nutrition-goal-${goal}`,
    page: 'health/nutrition',
    section: 'Daily goals',
    title: NUTRITION_GOAL_LIMITS[goal].label,
    keywords: KEYWORDS[goal],
    scope: 'server',
    control: 'custom',
    row: true,
    render: () => createElement(GoalRow, { goal }),
  };
}

function waterGoalText(state: StoreState): string {
  const goal = waterGoalIn(state);
  return goal.chosen ? litres(goal.ml) : `${litres(goal.ml)} (standard)`;
}

const onAndroid = (env: SettingEnv): boolean => env.platform === 'android';

export const SETTINGS: readonly SettingDefinition[] = [
  ...NUTRITION_GOAL_KEYS.map(goalSetting),
  {
    id: 'nutrition-water-goal',
    page: 'health/nutrition',
    section: 'Water',
    title: 'Water goal',
    keywords: ['water', 'hydration', 'drink', 'goal'],
    scope: 'server',
    control: 'link',
    href: href.settings.focus('health/goals', 'fitness-goal-hydration_ml'),
    value: waterGoalText,
  },
  {
    id: 'nutrition-glass',
    page: 'health/nutrition',
    section: 'Water',
    title: 'Glass size',
    description: 'Added with one tap',
    keywords: ['glass', 'water', 'cup', 'quick add'],
    scope: 'server',
    when: (state) => nutritionReady(state),
    control: 'select',
    options: GLASS_SIZES.map((ml) => ({ value: String(ml), label: millilitres(ml) })),
    read: (state) => String(nutritionPrefsOf(state).glassMl),
    write: (value, { store }) => saveNutritionPrefs(store, { glassMl: Number(value) }),
  },
  {
    id: 'health-entry-writes',
    page: 'health',
    section: 'This phone',
    title: 'Save what you log to Health Connect',
    keywords: ['health connect', 'save', 'food', 'water', 'log', 'write'],
    scope: 'device',
    visible: onAndroid,
    control: 'custom',
    row: true,
    render: () => createElement(EntryWritesRow),
  },
];
