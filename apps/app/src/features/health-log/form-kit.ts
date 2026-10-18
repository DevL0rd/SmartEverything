import { HC_CODES, type HcCode, type LoggableType } from '@smarteverything/domain';
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

export function choicesOf(codes: readonly HcCode[]): readonly Choice[] {
  return codes.map(({ code, short }) => ({ value: code, label: short }));
}

export const NOTES: LogField = { kind: 'text', key: 'notes', label: 'Notes' };
export const TITLE: LogField = { kind: 'text', key: 'title', label: 'Title' };

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
        options: choicesOf(HC_CODES.temperatureLocation),
        initial: 0,
      },
    ],
  };
}
