import { minuteOfClock } from '@smarteverything/domain';
import type { TimeOfDay } from '../../../../components/time-field';
import { twoDigits } from '../../../../format/number';

export function timeOfClock(clock: string): TimeOfDay {
  const minute = minuteOfClock(clock);
  return { hour: Math.floor(minute / 60), minute: minute % 60 };
}

export function clockOfTime(time: TimeOfDay): string {
  return `${twoDigits(time.hour)}:${twoDigits(time.minute)}`;
}
