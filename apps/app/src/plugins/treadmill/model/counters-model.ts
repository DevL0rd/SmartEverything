import type {
  HeartRateSource,
  InclineScale,
  KcalSource,
  TreadmillLiveFrame,
  TreadmillStateView,
} from '@smarteverything/domain';
import type { ChartPoint } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { count, decimal } from '../../../format/number';
import { heartZoneLabel, type LivePoint } from './speed-history';
import { clockText, distanceFigure, paceText } from './treadmill-model';

export type TrendKey = 'distance' | 'steps' | 'kcal' | 'cadence' | 'pace' | 'heart' | 'climb';

export interface CounterSpec {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly widest: string;
  readonly note?: string;
  readonly trend?: TrendKey;
  readonly colour?: ColourRole;
}

export const TREND_OF: Readonly<Record<TrendKey, (point: LivePoint) => number | null>> = {
  distance: (point) => point.distanceM,
  steps: (point) => point.steps,
  kcal: (point) => point.kcal,
  cadence: (point) => point.cadence,
  pace: (point) => (point.speed > 0 ? 3600 / point.speed : null),
  heart: (point) => point.heartRate,
  climb: (point) => point.climbM,
};

const KCAL_NOTE: Readonly<Record<KcalSource, string>> = {
  belt: 'from the belt',
  estimate: 'estimated',
};

const HEART_NOTE: Readonly<Record<HeartRateSource, string>> = {
  grips: 'Grips',
  watch: 'Watch',
};

export function inclineText(raw: number, scale: InclineScale): string {
  if (scale === 'percent') {
    return `${decimal(raw, 0)} %`;
  }
  return scale === 'levels' ? `Level ${decimal(raw, 0)}` : decimal(raw, 0);
}

export function inclineSummary(points: readonly ChartPoint[], scale: InclineScale): string {
  if (points.length === 0) {
    return 'Incline, last 5 minutes, no data yet';
  }
  const values = points.map((point) => point.v);
  return `Incline, last 5 minutes, ${inclineText(Math.min(...values), scale)} to ${inclineText(Math.max(...values), scale)}`;
}

export function heartSummary(points: readonly ChartPoint[]): string {
  if (points.length === 0) {
    return 'Heart rate, last 5 minutes, no data yet';
  }
  const values = points.map((point) => point.v);
  return `Heart rate, last 5 minutes, ${String(Math.min(...values))} to ${String(Math.max(...values))} beats per minute`;
}

function energyNote(body: NonNullable<TreadmillLiveFrame['body']>): string {
  const net = `Net ${count(Math.round(body.kcalNet))} kcal`;
  return body.kcalSource === null ? net : `${net}, ${KCAL_NOTE[body.kcalSource]}`;
}

function heartNote(
  body: NonNullable<TreadmillLiveFrame['body']>,
  heartRate: number,
  maxBpm: number | null,
): string | undefined {
  const source = body.heartRateSource === null ? null : HEART_NOTE[body.heartRateSource];
  const zone = maxBpm === null ? null : heartZoneLabel(heartRate, maxBpm);
  const parts = [source, zone].flatMap((part) => (part === null ? [] : [part]));
  return parts.length === 0 ? undefined : parts.join(', ');
}

function bodySpecs(frame: TreadmillLiveFrame, maxBpm: number | null): readonly CounterSpec[] {
  const { body } = frame;
  if (body === null) {
    return [];
  }
  const energy: CounterSpec = {
    key: 'energy',
    label: 'Energy',
    value: count(Math.round(body.kcal)),
    unit: 'kcal',
    widest: '0,000',
    note: energyNote(body),
    trend: 'kcal',
  };
  const note = body.heartRate === null ? undefined : heartNote(body, body.heartRate, maxBpm);
  const heart: readonly CounterSpec[] =
    body.heartRate === null
      ? []
      : [
          {
            key: 'heart',
            label: 'Heart rate',
            value: String(body.heartRate),
            unit: 'bpm',
            widest: '000',
            trend: 'heart',
            colour: 'critical',
            ...(note === undefined ? {} : { note }),
          },
        ];
  return [energy, ...heart];
}

function beltSpecs(belt: TreadmillLiveFrame['belt']): {
  readonly steps: readonly CounterSpec[];
  readonly cadence: readonly CounterSpec[];
} {
  return {
    steps:
      belt.steps === null
        ? []
        : [
            {
              key: 'steps',
              label: 'Steps',
              value: count(belt.steps),
              widest: '00,000',
              trend: 'steps',
            },
          ],
    cadence:
      belt.cadence === null
        ? []
        : [
            {
              key: 'cadence',
              label: 'Cadence',
              value: decimal(belt.cadence),
              unit: 'steps/min',
              widest: '000',
              trend: 'cadence',
            },
          ],
  };
}

function climbSpecs(session: TreadmillLiveFrame['session']): readonly CounterSpec[] {
  const climb = session === null ? null : session.climbM;
  return climb === null
    ? []
    : [
        {
          key: 'climb',
          label: 'Climb',
          value: count(Math.round(climb)),
          unit: 'm',
          widest: '0,000',
          trend: 'climb',
          colour: 'viz-violet',
        },
      ];
}

export function countersOf(
  view: Pick<TreadmillStateView, 'bodyVisible'>,
  frame: TreadmillLiveFrame,
  maxBpm: number | null = null,
): readonly CounterSpec[] {
  const { belt } = frame;
  const distance = distanceFigure(belt.distanceM);
  const { steps, cadence } = beltSpecs(belt);
  return [
    {
      key: 'time',
      label: 'Time',
      value: clockText(belt.timeS),
      widest: '0:00:00',
      trend: 'distance',
    },
    {
      key: 'distance',
      label: 'Distance',
      value: distance.value,
      unit: distance.unit,
      widest: '00.00',
      trend: 'distance',
    },
    ...steps,
    ...(view.bodyVisible ? bodySpecs(frame, maxBpm) : []),
    ...climbSpecs(frame.session),
    {
      key: 'pace',
      label: 'Pace',
      value: paceText(belt.speedKmh),
      widest: '00:00 /km',
      trend: 'pace',
    },
    ...cadence,
  ];
}
