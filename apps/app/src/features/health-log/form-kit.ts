import type { LoggableType } from '@smarteverything/domain';
import type { IconName } from '../../components/icon';

export interface Choice {
  readonly value: number;
  readonly label: string;
}

export type LogField =
  | {
      readonly kind: 'number';
      readonly key: string;
      readonly label: string;
      readonly unit: string;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly initial: number;
      readonly scale?: number;
    }
  | {
      readonly kind: 'choice';
      readonly key: string;
      readonly label: string;
      readonly options: readonly Choice[];
      readonly initial: number;
    }
  | { readonly kind: 'text'; readonly key: string; readonly label: string };

type LogTiming = 'instant' | 'duration' | 'span';

export interface LogForm {
  readonly type: Exclude<LoggableType, 'Nutrition' | 'Hydration'>;
  readonly title: string;
  readonly icon: IconName;
  readonly group: string;
  readonly timing: LogTiming;
  readonly minutes?: number;
  readonly fields: readonly LogField[];
  readonly fixed?: Readonly<Record<string, unknown>>;
}

export function choices(...labels: readonly string[]): readonly Choice[] {
  return labels.map((label, value) => ({ value, label }));
}

export const NOTES: LogField = { kind: 'text', key: 'notes', label: 'Notes' };
export const TITLE: LogField = { kind: 'text', key: 'title', label: 'Title' };

const TEMPERATURE_PLACES = choices(
  'Not set',
  'Armpit',
  'Finger',
  'Forehead',
  'Mouth',
  'Rectum',
  'Temple',
  'Toe',
  'Ear',
  'Wrist',
  'Vagina',
);

export const MEAL_CODES = choices('Not set', 'Breakfast', 'Lunch', 'Dinner', 'Snack');

export function temperature(
  type: 'BodyTemperature' | 'BasalBodyTemperature',
  title: string,
  group: string,
): LogForm {
  return {
    type,
    title,
    icon: 'thermometer',
    group,
    timing: 'instant',
    fields: [
      {
        kind: 'number',
        key: 'celsius',
        label: 'Temperature',
        unit: '°C',
        min: 34,
        max: 43,
        step: 0.1,
        initial: 36.6,
      },
      {
        kind: 'choice',
        key: 'measurementLocation',
        label: 'Measured at',
        options: TEMPERATURE_PLACES,
        initial: 0,
      },
    ],
  };
}
