import type { PreloadContext, RouteDefinition } from '../../app-shell/route-types';
import { readEntries, readFoods } from '../../api/nutrition';
import { FOODS_KEY, entriesKey } from '../../queries/health-entries';
import { LOGGED_TYPES } from './data/day-log';
import { dayKeyOf, endOfDayKey, startOfDayKey } from '../../format/time';

const hasHealth = (availability: { readonly hasHealth: boolean }): boolean =>
  availability.hasHealth;

async function preloadNutrition({ queryClient }: PreloadContext): Promise<void> {
  const today = dayKeyOf(Date.now());
  const from = startOfDayKey(today);
  const to = endOfDayKey(today);
  await queryClient.query({
    queryKey: entriesKey(from, to, LOGGED_TYPES.join(',')),
    queryFn: () => readEntries(from, to, LOGGED_TYPES),
  });
  await queryClient.query({ queryKey: FOODS_KEY, queryFn: readFoods });
}

export const ROUTES: readonly RouteDefinition[] = [
  {
    key: 'fitness-nutrition',
    href: '/fitness/nutrition',
    title: 'Nutrition',
    icon: 'salad',
    tab: 'fitness',
    parent: 'fitness',
    keywords: ['food', 'calories', 'macros', 'protein', 'carbs', 'fat', 'water', 'meals', 'diet'],
    available: hasHealth,
    preload: preloadNutrition,
    searchable: true,
  },
  {
    key: 'log-food',
    href: '/log-food',
    title: 'Add food',
    icon: 'plus',
    tab: 'fitness',
    parent: 'fitness-nutrition',
    keywords: ['log food', 'add meal', 'eat', 'drink', 'barcode', 'calories'],
    available: hasHealth,
    searchable: true,
  },
];
