import { useLocalSearchParams } from 'expo-router';
import { useMinute } from '../../../store/clock';
import { DAY_KEY, dayKeyOf } from '../../../format/time';
import { RANGE, type Range } from '../model/window';

export function useToday(): string {
  return dayKeyOf(useMinute());
}

export interface FitnessParams {
  readonly day: string;
  readonly today: string;
  readonly range: Range;
}

export function useFitnessParams(fallbackRange: Range): FitnessParams {
  const today = useToday();
  const params = useLocalSearchParams<{ day?: string; range?: string }>();
  const day = DAY_KEY.safeParse(params.day);
  const range = RANGE.safeParse(params.range);
  const chosen = day.success && day.data <= today ? day.data : today;
  return { day: chosen, today, range: range.success ? range.data : fallbackRange };
}
