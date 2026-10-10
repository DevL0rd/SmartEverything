import { createContext, useContext } from 'react';
import type { EffectiveFitnessGoals } from '../model/goals';
import type { DailyFigure } from '../model/points';
import { shiftDay } from '../../../format/time';
import { useGoals } from './goals';
import { PRESENCE_DAYS, useDailyRows } from './queries';

export interface TodayData {
  readonly day: string;
  readonly today: string;
  readonly figures: readonly DailyFigure[];
  readonly goals: EffectiveFitnessGoals;
  readonly complete: boolean;
}

export function useTodayData(
  day: string,
  today: string,
): TodayData & { readonly error: Error | null } {
  const rows = useDailyRows(shiftDay(day, -PRESENCE_DAYS), today);
  const goals = useGoals();
  return {
    day,
    today,
    figures: rows.figures.filter((figure) => figure.day <= day),
    goals,
    complete: rows.complete,
    error: rows.error,
  };
}

class TodayContextMissingError extends Error {
  override readonly name = 'TodayContextMissingError';

  constructor() {
    super('A Fitness widget was rendered outside the Fitness Today board.');
  }
}

export const TodayContext = createContext<TodayData | null>(null);

export function useTodayContext(): TodayData {
  const value = useContext(TodayContext);
  if (value === null) {
    throw new TodayContextMissingError();
  }
  return value;
}
