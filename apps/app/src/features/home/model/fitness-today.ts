import type { HealthDailyRow, HealthMetric } from '@smarteverything/domain';
import { count, decimal } from '../../../format/number';

interface FigureSpec {
  readonly metric: HealthMetric;
  readonly label: string;
  readonly unit: string;
  readonly show: (value: number) => string;
}

const SPECS: readonly FigureSpec[] = [
  { metric: 'steps', label: 'Steps', unit: '', show: count },
  { metric: 'active_energy', label: 'Move', unit: 'kcal', show: count },
  { metric: 'exercise', label: 'Exercise', unit: 'min', show: count },
  {
    metric: 'distance',
    label: 'Distance',
    unit: 'km',
    show: (metres) => decimal(metres / 1000, 1),
  },
];

const SHOWN = 3;

export interface FitnessFigure {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string;
}

export interface FitnessDay {
  readonly day: string;
  readonly figures: readonly FitnessFigure[];
}

const TRACKED: ReadonlySet<HealthMetric> = new Set(SPECS.map((spec) => spec.metric));

export function fitnessDayOf(
  rows: readonly HealthDailyRow[],
  today: string,
  profileId: string | null,
): FitnessDay | null {
  const mine = rows.filter(
    (row) =>
      TRACKED.has(row.metric) &&
      row.day <= today &&
      (row.profile_id === null || row.profile_id === profileId),
  );
  const day = mine.reduce<string | null>(
    (latest, row) => (latest === null || row.day > latest ? row.day : latest),
    null,
  );
  if (day === null) {
    return null;
  }
  const figures = SPECS.flatMap((spec) => {
    const row = mine.find((candidate) => candidate.day === day && candidate.metric === spec.metric);
    return row === undefined
      ? []
      : [{ key: spec.metric, label: spec.label, value: spec.show(row.value), unit: spec.unit }];
  });
  return { day, figures: figures.slice(0, SHOWN) };
}
