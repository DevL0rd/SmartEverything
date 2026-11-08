import type { VacuumRole } from '@smarteverything/domain';
import type { BadgeTone } from '../../../../components/badge';
import type { IconName } from '../../../../components/icon';
import type { ColourRole } from '../../../../design/tokens';
import { DAY_MS, shortDate } from '../../../../format/time';
import {
  careWarning,
  type ConsumablePart,
  type ConsumableTone,
  type ConsumableView,
  type LifeForecast,
} from '../model/consumables';

const UNPROVEN_RESET_PARTS: readonly ConsumablePart[] = ['detergent'];

export const PART_ICON: Readonly<Record<ConsumablePart, IconName>> = {
  main_brush: 'brush',
  side_brush: 'fan',
  filter: 'filter',
  roller_mop: 'droplet',
  corner_mop: 'sparkles',
  dust_bag: 'trash',
  detergent: 'glassWater',
};

export const TONE_COLOUR: Readonly<Record<ConsumableTone, ColourRole>> = {
  positive: 'positive',
  warning: 'warning',
  critical: 'critical',
  unknown: 'on-surface-faint',
};

export interface PartStatus {
  readonly label: string;
  readonly tone: 'warning' | 'critical';
}

export interface PartLine {
  readonly value: string;
  readonly left: string;
  readonly forecastDate: string | null;
  readonly status: PartStatus | null;
}

export interface CareSummary {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: 'circleCheck' | 'alert';
}

export function resetRoleOf(view: ConsumableView): VacuumRole | null {
  return UNPROVEN_RESET_PARTS.includes(view.part) ? null : view.resetRole;
}

export function adviceLabel(view: ConsumableView): string {
  return view.adviceWord ?? 'Good';
}

export function daysLeftOf(forecast: LifeForecast, now: number): number {
  return Math.max(0, Math.ceil((forecast.replaceAtMs - now) / DAY_MS));
}

function daysText(days: number): string {
  if (days === 0) {
    return 'Due today';
  }
  return days === 1 ? '1 day left' : `${String(days)} days left`;
}

function statusOf(view: ConsumableView): PartStatus | null {
  if (view.tone === 'warning' || view.tone === 'critical') {
    return { label: adviceLabel(view), tone: view.tone };
  }
  return null;
}

function leftOf(view: ConsumableView, forecast: LifeForecast | null, now: number): string {
  if (view.lifePercent === 0) {
    return 'Worn out';
  }
  if (forecast !== null) {
    return daysText(daysLeftOf(forecast, now));
  }
  if (view.timeLeftText !== null) {
    return view.timeLeftText;
  }
  return view.lifePercent === null ? 'Not reported yet' : 'Not enough use to forecast';
}

export function partLineOf(
  view: ConsumableView,
  forecast: LifeForecast | null,
  now: number,
): PartLine {
  const percent = view.lifePercent;
  return {
    value: percent === null ? 'Unknown' : `${String(Math.round(percent))}%`,
    left: leftOf(view, forecast, now),
    forecastDate:
      forecast === null || percent === 0 ? null : `by ${shortDate(forecast.replaceAtMs)}`,
    status: statusOf(view),
  };
}

export function careSummaryOf(views: readonly ConsumableView[]): CareSummary | null {
  const due = careWarning(views);
  if (due !== null) {
    return { label: due, tone: 'critical', icon: 'alert' };
  }
  const soon = views.filter((view) => view.tone === 'warning').length;
  if (soon > 0) {
    return { label: `${String(soon)} to replace soon`, tone: 'warning', icon: 'alert' };
  }
  return views.every((view) => view.tone === 'positive')
    ? { label: 'All good', tone: 'positive', icon: 'circleCheck' }
    : null;
}
