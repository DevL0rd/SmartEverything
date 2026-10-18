import { twoDigits } from './number';

export interface ClockTime {
  readonly hour: number;
  readonly minute: number;
}

export function timeOfClockText(text: string): ClockTime {
  const [hour = 0, minute = 0] = text.split(':').map(Number);
  return { hour, minute };
}

export function clockTextOfTime(time: ClockTime): string {
  return `${twoDigits(time.hour)}:${twoDigits(time.minute)}`;
}
