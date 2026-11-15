import type { BarShape } from '../../../components/charts/bar-marks';
import { barSlots } from '../../../components/charts/bar-path';
import { bytes } from '../../../format/number';
import { monthLabel, type TrashItem } from './trash-model';

export interface LeavingMonth {
  readonly month: string;
  readonly bytes: number;
}

export const BARS_HEIGHT = 56;
const RADIUS = 3;
const GAP_SHARE = 0.25;
const MONTHS_IN_YEAR = 12;

function monthIndexOf(key: string): number {
  return Number(key.slice(0, 4)) * MONTHS_IN_YEAR + Number(key.slice(5, 7)) - 1;
}

function monthKeyOf(index: number): string {
  const year = Math.floor(index / MONTHS_IN_YEAR);
  const month = (index % MONTHS_IN_YEAR) + 1;
  return `${String(year)}-${String(month).padStart(2, '0')}`;
}

export function leavingMonthsOf(
  items: readonly Pick<TrashItem, 'purgeMonth' | 'bytes'>[],
  today: string,
): readonly LeavingMonth[] {
  if (items.length === 0) return [];
  const first = monthIndexOf(today);
  const last = Math.max(first, ...items.map((item) => monthIndexOf(item.purgeMonth)));
  const sums = new Map<number, number>();
  for (const item of items) {
    const index = Math.max(first, monthIndexOf(item.purgeMonth));
    sums.set(index, (sums.get(index) ?? 0) + item.bytes);
  }
  return Array.from({ length: last - first + 1 }, (_, offset) => ({
    month: monthKeyOf(first + offset),
    bytes: sums.get(first + offset) ?? 0,
  }));
}

export function leavingShapes(
  months: readonly LeavingMonth[],
  width: number,
  fill: string,
): readonly BarShape[] {
  const slots = barSlots(months.length, width, { gap: GAP_SHARE, min: 1 });
  const peak = Math.max(1, ...months.map((month) => month.bytes));
  const unit = BARS_HEIGHT / peak;
  return months.flatMap((month, index) => {
    const slot = slots[index];
    if (slot === undefined || month.bytes === 0) return [];
    return [
      {
        key: month.month,
        ...slot,
        top: Math.min(BARS_HEIGHT - 1, BARS_HEIGHT - month.bytes * unit),
        bottom: BARS_HEIGHT,
        radii: { top: RADIUS, bottom: 0 },
        opacity: 1,
        fill,
      },
    ];
  });
}

export function leavingTotalOf(months: readonly LeavingMonth[]): number {
  return months.reduce((sum, month) => sum + month.bytes, 0);
}

export function leavingLabel(months: readonly LeavingMonth[]): string {
  const parts = months
    .filter((month) => month.bytes > 0)
    .map((month) => `${monthLabel(month.month)}: ${bytes(month.bytes)}`);
  return parts.length === 0
    ? 'Nothing leaves for good in the coming months'
    : `Leaving Trash for good each month. ${parts.join('; ')}`;
}
