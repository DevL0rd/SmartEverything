const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;

export function countLabel(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

export function unitLabel(count: number, unit: string): string {
  const singular = unit.endsWith('s') ? unit.slice(0, -1) : unit;
  return countLabel(count, singular);
}

export function clockLabel(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / MINUTE);
  return `${String(minutes)}:${String(whole % MINUTE).padStart(2, '0')}`;
}

export function agoLabel(from: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < MINUTE) return 'just now';
  if (seconds < HOUR) return `${String(Math.floor(seconds / MINUTE))} min ago`;
  if (seconds < DAY) return `${String(Math.floor(seconds / HOUR))} h ago`;
  return countLabel(Math.floor(seconds / DAY), 'day') + ' ago';
}

export function daysLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days < 1) return 'Less than a day';
  if (days > 365) return 'More than a year';
  return countLabel(Math.round(days), 'day');
}

export function percentLabel(value: number | null): string {
  return value === null ? 'Not reported' : `${String(Math.round(value))}%`;
}
