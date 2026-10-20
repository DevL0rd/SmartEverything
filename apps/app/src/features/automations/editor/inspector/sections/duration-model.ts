export type DurationUnit = 'ms' | 's' | 'min' | 'h';

export const UNIT_SIZE: Readonly<Record<DurationUnit, number>> = {
  ms: 1,
  s: 1000,
  min: 60_000,
  h: 3_600_000,
};

export const DURATION_UNITS: readonly { readonly value: DurationUnit; readonly label: string }[] = [
  { value: 'ms', label: 'ms' },
  { value: 's', label: 's' },
  { value: 'min', label: 'min' },
  { value: 'h', label: 'h' },
];

export interface DurationParts {
  readonly amount: number;
  readonly unit: DurationUnit;
}

const LARGEST_FIRST: readonly DurationUnit[] = ['h', 'min', 's'];

export function splitDuration(milliseconds: number): DurationParts {
  const unit = LARGEST_FIRST.find(
    (candidate) => milliseconds !== 0 && milliseconds % UNIT_SIZE[candidate] === 0,
  );
  const chosen = unit ?? 'ms';
  return { amount: milliseconds / UNIT_SIZE[chosen], unit: chosen };
}

export function joinDuration(parts: DurationParts): number {
  return Math.round(parts.amount * UNIT_SIZE[parts.unit]);
}
