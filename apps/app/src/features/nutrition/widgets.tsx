import type { ReactNode } from 'react';
import type { WidgetDefinition, WidgetSize } from '../../components/widget-board';
import { allSizes } from '../../components/widget-board/all-sizes';
import { useDayKey } from '../../store/clock';
import { useNutritionPrefs } from './data/prefs';
import { useRecentMetric } from './data/totals';
import { useWaterGoal } from './data/water-goal';
import { hasAnyGoal } from './model/macros';
import {
  CaloriesWidget,
  MacrosWidget,
  WaterWidget,
  type DayProps,
} from './widgets/nutrition-widgets';

export interface WidgetDay {
  readonly day: string;
  readonly today: string;
}

export type DaySource = () => WidgetDay;

const RECENT_DAYS = 30;

export function useTodayKey(): WidgetDay {
  const today = useDayKey();
  return { day: today, today };
}

function onDay(
  useDay: DaySource,
  Widget: (props: DayProps) => ReactNode,
): (props: { readonly size: WidgetSize }) => ReactNode {
  return function DayWidget({ size }: { readonly size: WidgetSize }): ReactNode {
    const { day, today } = useDay();
    return <Widget size={size} day={day} today={today} />;
  };
}

export function nutritionWidgets(useDay: DaySource, group?: string): readonly WidgetDefinition[] {
  const Calories = onDay(useDay, CaloriesWidget);
  const Macros = onDay(useDay, MacrosWidget);
  const Water = onDay(useDay, WaterWidget);
  const grouped = group === undefined ? {} : { group };
  return [
    {
      type: 'calories',
      title: 'Calories',
      icon: 'flame',
      ...grouped,
      sizes: allSizes('M', 'W'),
      defaultSize: 'M',
      render: ({ size }) => <Calories size={size} />,
    },
    {
      type: 'macros',
      title: 'Macros',
      icon: 'salad',
      ...grouped,
      sizes: allSizes('M'),
      defaultSize: 'M',
      render: ({ size }) => <Macros size={size} />,
    },
    {
      type: 'hydration',
      title: 'Water',
      icon: 'glassWater',
      ...grouped,
      sizes: allSizes('M', 'W'),
      defaultSize: 'M',
      render: ({ size }) => <Water size={size} />,
    },
  ];
}

export function useNutritionWidgets(day: string): ReadonlySet<string> {
  const prefs = useNutritionPrefs();
  const food = useRecentMetric(day, RECENT_DAYS, 'energy_in');
  const water = useRecentMetric(day, RECENT_DAYS, 'hydration');
  const waterGoal = useWaterGoal().chosen;
  const goals = prefs !== null && hasAnyGoal(prefs);
  const shown: string[] = [];
  if (food || goals) {
    shown.push('calories', 'macros');
  }
  if (water || waterGoal) {
    shown.push('hydration');
  }
  return new Set(shown);
}
