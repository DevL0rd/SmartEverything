import type { ClockText } from '@smarteverything/domain';
import type { TimeOfDay } from '../../../components/time-field';
import { twoDigits } from '../../../format/number';

const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

export function parseClockText(text: string): TimeOfDay | null {
  const match = CLOCK.exec(text.trim());
  if (match === null) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

export function clockLabel(time: TimeOfDay): string {
  return `${twoDigits(time.hour)}:${twoDigits(time.minute)}`;
}

export function clockTextOf(time: TimeOfDay, clock: ClockText): string {
  return clock === 'seconds' ? `${clockLabel(time)}:00` : clockLabel(time);
}
