import type { Score } from '../model/scores';
import { readinessOf } from '../model/today';
import { useLastNight } from './nights';
import type { TodayData } from './today';

export function useReadiness(data: TodayData): Score | null {
  const { night } = useLastNight(data.day);
  return readinessOf({
    figures: data.figures,
    day: data.day,
    night,
    sleepGoal: data.goals.sleep_minutes,
  });
}
