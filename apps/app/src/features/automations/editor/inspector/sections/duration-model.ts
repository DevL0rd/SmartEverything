export type DurationUnit = 's' | 'min' | 'h' | 'd';

export const UNIT_SIZE: Readonly<Record<DurationUnit, number>> = {
  s: 1000,
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export const DURATION_UNITS: readonly {
  readonly value: DurationUnit;
  readonly label: string;
  readonly spoken: string;
}[] = [
  { value: 's', label: 's', spoken: 'Seconds' },
  { value: 'min', label: 'min', spoken: 'Minutes' },
  { value: 'h', label: 'h', spoken: 'Hours' },
  { value: 'd', label: 'days', spoken: 'Days' },
];

export interface DurationParts {
  readonly amount: number;
  readonly unit: DurationUnit;
}

const LARGEST_FIRST: readonly DurationUnit[] = ['d', 'h', 'min', 's'];

export function splitDuration(milliseconds: number): DurationParts {
  const unit = LARGEST_FIRST.find(
    (candidate) => milliseconds !== 0 && milliseconds % UNIT_SIZE[candidate] === 0,
  );
  const chosen = unit ?? 's';
  return { amount: milliseconds / UNIT_SIZE[chosen], unit: chosen };
}

export function inUnit(milliseconds: number, unit: DurationUnit): DurationParts {
  return { amount: milliseconds / UNIT_SIZE[unit], unit };
}

export function joinDuration(parts: DurationParts): number {
  return Math.round(parts.amount * UNIT_SIZE[parts.unit]);
}

export function atLeast(milliseconds: number, least: number): number {
  return Math.max(least, milliseconds);
}
