import { ringsOf } from '../model/today';
import type { EffectiveFitnessGoals } from '../model/goals';
import type { DailyFigure } from '../model/points';
import { useToday } from './day';
import { useTodayData } from './today';

export function moveProgressOf(
  figures: readonly DailyFigure[],
  day: string,
  goals: EffectiveFitnessGoals,
): number | null {
  const ring = ringsOf(figures, day, goals).find((candidate) => candidate.key === 'move');
  return ring?.value === null ? null : (ring?.progress ?? null);
}

export function useMoveProgress(): number | null {
  const today = useToday();
  const data = useTodayData(today, today);
  return moveProgressOf(data.figures, today, data.goals);
}
