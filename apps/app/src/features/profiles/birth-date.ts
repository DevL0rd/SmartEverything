export interface Ymd {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export const BIRTH_YEAR_MIN = 1900;

const TYPICAL_AGE = 30;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function ymdOf(birthDate: string | null, today: Date): Ymd {
  if (birthDate === null) {
    return { year: today.getFullYear() - TYPICAL_AGE, month: 1, day: 1 };
  }
  const [year = 0, month = 1, day = 1] = birthDate.split('-').map(Number);
  return { year, month, day };
}

export function withPart(ymd: Ymd, part: keyof Ymd, value: number): Ymd {
  const next = { ...ymd, [part]: value };
  return { ...next, day: Math.min(next.day, daysInMonth(next.year, next.month)) };
}

export function birthIso({ year, month, day }: Ymd): string {
  const two = (value: number): string => String(value).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${two(month)}-${two(day)}`;
}

export function isPast(ymd: Ymd, today: Date): boolean {
  const now = { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
  return birthIso(ymd) <= birthIso(now);
}
