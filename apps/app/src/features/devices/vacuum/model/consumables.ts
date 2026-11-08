import type { VacuumRole, VacuumValueRole, VacuumValues } from '@smarteverything/domain';
import type { ChartPoint } from '../../../../components/charts';
import { DAY_MS, shortDate } from '../../../../format/time';

export type ConsumablePart =
  'main_brush' | 'side_brush' | 'filter' | 'roller_mop' | 'corner_mop' | 'dust_bag' | 'detergent';

export type ConsumableTone = 'positive' | 'warning' | 'critical' | 'unknown';

export type ConsumableAdvice = 'ok' | 'soon' | 'now' | 'unknown';

interface PartDefinition {
  readonly part: ConsumablePart;
  readonly label: string;
  readonly dueWord: string;
  readonly lifeRole: VacuumValueRole;
  readonly leftRole: VacuumValueRole;
  readonly hoursKnown: boolean;
  readonly leftSuffix: string;
  readonly resetRole: VacuumRole;
}

export const CONSUMABLE_PARTS: readonly PartDefinition[] = [
  {
    part: 'main_brush',
    label: 'Main brush',
    dueWord: 'due',
    lifeRole: 'vacuum_main_brush_life',
    leftRole: 'vacuum_main_brush_left',
    hoursKnown: true,
    leftSuffix: 'of cleaning',
    resetRole: 'vacuum_reset_main_brush',
  },
  {
    part: 'side_brush',
    label: 'Side brush',
    dueWord: 'due',
    lifeRole: 'vacuum_side_brush_life',
    leftRole: 'vacuum_side_brush_left',
    hoursKnown: true,
    leftSuffix: 'of cleaning',
    resetRole: 'vacuum_reset_side_brush',
  },
  {
    part: 'filter',
    label: 'Filter',
    dueWord: 'due',
    lifeRole: 'filter_life',
    leftRole: 'vacuum_filter_left',
    hoursKnown: true,
    leftSuffix: 'of cleaning',
    resetRole: 'vacuum_reset_filter',
  },
  {
    part: 'roller_mop',
    label: 'Roller mop',
    dueWord: 'due',
    lifeRole: 'vacuum_roller_life',
    leftRole: 'vacuum_roller_left',
    hoursKnown: true,
    leftSuffix: 'of cleaning',
    resetRole: 'vacuum_reset_roller',
  },
  {
    part: 'corner_mop',
    label: 'Corner mop pad',
    dueWord: 'due',
    lifeRole: 'vacuum_mop_life',
    leftRole: 'vacuum_mop_left',
    hoursKnown: true,
    leftSuffix: 'of cleaning',
    resetRole: 'vacuum_reset_mop',
  },
  {
    part: 'dust_bag',
    label: 'Dust bag',
    dueWord: 'due',
    lifeRole: 'vacuum_dust_bag_life',
    leftRole: 'vacuum_dust_bag_left',
    hoursKnown: false,
    leftSuffix: 'left',
    resetRole: 'vacuum_reset_dust_bag',
  },
  {
    part: 'detergent',
    label: 'Detergent',
    dueWord: 'low',
    lifeRole: 'vacuum_detergent_level',
    leftRole: 'vacuum_detergent_left',
    hoursKnown: true,
    leftSuffix: 'left',
    resetRole: 'vacuum_reset_detergent',
  },
];

export interface ConsumableView {
  readonly part: ConsumablePart;
  readonly label: string;
  readonly lifeRole: VacuumValueRole;
  readonly leftRole: VacuumValueRole;
  readonly resetRole: VacuumRole;
  readonly lifePercent: number | null;
  readonly hoursLeft: number | null;
  readonly timeLeftText: string | null;
  readonly tone: ConsumableTone;
  readonly advice: ConsumableAdvice;
  readonly adviceWord: string | null;
  readonly due: boolean;
  readonly dueText: string;
}

export const POSITIVE_ABOVE_PERCENT = 30;
export const CRITICAL_UNDER_PERCENT = 10;

function percentOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;
}

function hoursOf(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function toneOf(percent: number | null): ConsumableTone {
  if (percent === null) {
    return 'unknown';
  }
  if (percent > POSITIVE_ABOVE_PERCENT) {
    return 'positive';
  }
  return percent < CRITICAL_UNDER_PERCENT ? 'critical' : 'warning';
}

const ADVICE: Readonly<Record<ConsumableTone, readonly [ConsumableAdvice, string | null]>> = {
  positive: ['ok', null],
  warning: ['soon', 'Replace soon'],
  critical: ['now', 'Replace now'],
  unknown: ['unknown', null],
};

function leftText(hours: number | null, suffix: string): string | null {
  return hours === null ? null : `about ${String(Math.round(hours))} h ${suffix}`;
}

function viewOf(definition: PartDefinition, values: VacuumValues): ConsumableView | null {
  const lifePercent = percentOf(values[definition.lifeRole]);
  const reportedLeft = hoursOf(values[definition.leftRole]);
  if (lifePercent === null && reportedLeft === null) {
    return null;
  }
  const hoursLeft = definition.hoursKnown ? reportedLeft : null;
  const tone = toneOf(lifePercent);
  const [advice, adviceWord] = ADVICE[tone];
  return {
    part: definition.part,
    label: definition.label,
    lifeRole: definition.lifeRole,
    leftRole: definition.leftRole,
    resetRole: definition.resetRole,
    lifePercent,
    hoursLeft,
    timeLeftText: leftText(hoursLeft, definition.leftSuffix),
    tone,
    advice,
    adviceWord,
    due: lifePercent !== null && lifePercent <= CRITICAL_UNDER_PERCENT,
    dueText: `${definition.label} ${definition.dueWord}`,
  };
}

export function consumablesOf(values: VacuumValues): readonly ConsumableView[] {
  return CONSUMABLE_PARTS.flatMap((definition) => {
    const view = viewOf(definition, values);
    return view === null ? [] : [view];
  });
}

export function careWarning(views: readonly ConsumableView[]): string | null {
  const due = views.filter((view) => view.due);
  const worst = due.reduce<ConsumableView | null>(
    (lowest, view) =>
      lowest === null || (view.lifePercent ?? 100) < (lowest.lifePercent ?? 100) ? view : lowest,
    null,
  );
  return worst?.dueText ?? null;
}

export interface LifeForecast {
  readonly dailyUsePercent: number;
  readonly replaceAtMs: number;
  readonly line: readonly ChartPoint[];
}

const RESET_JUMP_PERCENT = 1;

function sinceLastReset(points: readonly ChartPoint[]): readonly ChartPoint[] {
  let start = 0;
  points.forEach((point, index) => {
    const before = points[index - 1];
    if (before !== undefined && point.v > before.v + RESET_JUMP_PERCENT) {
      start = index;
    }
  });
  return points.slice(start);
}

export function lifeForecast(points: readonly ChartPoint[]): LifeForecast | null {
  const run = sinceLastReset(points);
  const first = run[0];
  const last = run[run.length - 1];
  if (first === undefined || last === undefined) {
    return null;
  }
  const days = (last.t - first.t) / DAY_MS;
  const dailyUsePercent = days < 1 ? 0 : (first.v - last.v) / days;
  if (dailyUsePercent <= 0) {
    return null;
  }
  const replaceAtMs = last.t + (last.v / dailyUsePercent) * DAY_MS;
  return {
    dailyUsePercent,
    replaceAtMs,
    line: [
      { t: last.t, v: last.v },
      { t: replaceAtMs, v: 0 },
    ],
  };
}

export function replaceAround(forecast: LifeForecast): string {
  return `Replace around ${shortDate(forecast.replaceAtMs)}`;
}
