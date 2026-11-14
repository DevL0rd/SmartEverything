import type { LibraryBucket } from '@smarteverything/domain';
import { zonedDateFormat } from '../../format/locale';
import { count } from '../../format/number';

export const YEAR_LABEL_LINE = 16;

const MONTH_TITLE = zonedDateFormat({ month: 'long', year: 'numeric' });

export interface ScrubMonth {
  readonly month: string;
  readonly count: number;
  readonly before: number;
  readonly start: number;
  readonly end: number;
}

export interface YearTick {
  readonly year: string;
  readonly at: number;
}

export interface ScrubberModel {
  readonly months: readonly ScrubMonth[];
  readonly ticks: readonly YearTick[];
  readonly total: number;
  readonly peak: number;
}

export interface ScrubPoint {
  readonly index: number;
  readonly month: string;
  readonly count: number;
  readonly item: number;
}

export function scrubberModel(buckets: readonly LibraryBucket[]): ScrubberModel {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const months: ScrubMonth[] = [];
  let before = 0;
  for (const bucket of buckets) {
    months.push({
      month: bucket.month,
      count: bucket.count,
      before,
      start: before / total,
      end: (before + bucket.count) / total,
    });
    before += bucket.count;
  }
  const peak = buckets.reduce((most, bucket) => Math.max(most, bucket.count), 0);
  return { months, ticks: yearTicks(months), total, peak };
}

export function yearTicks(months: readonly ScrubMonth[]): readonly YearTick[] {
  const ticks: YearTick[] = [];
  for (const month of months) {
    const year = month.month.slice(0, 4);
    if (ticks.at(-1)?.year !== year) ticks.push({ year, at: month.start });
  }
  return ticks;
}

export function labelledTicks(ticks: readonly YearTick[], height: number): readonly YearTick[] {
  const shown: YearTick[] = [];
  for (const tick of ticks) {
    const last = shown.at(-1);
    const fits = (1 - tick.at) * height >= YEAR_LABEL_LINE;
    if (fits && (last === undefined || (tick.at - last.at) * height >= YEAR_LABEL_LINE)) {
      shown.push(tick);
    }
  }
  return shown;
}

export function clampShare(share: number): number {
  'worklet';
  return Math.min(1, Math.max(0, share));
}

export function monthIndexAt(months: readonly ScrubMonth[], share: number): number {
  let low = 0;
  let high = months.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    const start = months[middle]?.start ?? 1;
    if (start <= share) low = middle;
    else high = middle - 1;
  }
  return low;
}

export function itemAt(total: number, share: number): number {
  'worklet';
  return Math.max(0, Math.min(total - 1, Math.floor(clampShare(share) * total)));
}

export function pointAt(model: ScrubberModel, share: number): ScrubPoint | null {
  const index = monthIndexAt(model.months, clampShare(share));
  const month = model.months[index];
  if (month === undefined) return null;
  const item = itemAt(model.total, share) - month.before;
  return { index, month: month.month, count: month.count, item };
}

export function shareOfItem(model: ScrubberModel, month: string, item: number): number | null {
  const found = model.months.find((entry) => entry.month === month);
  if (found === undefined) return null;
  const within = Math.min(found.count, Math.max(0, item));
  return (found.before + within) / model.total;
}

export function stepMonth(model: ScrubberModel, share: number, by: number): number | null {
  const index = monthIndexAt(model.months, clampShare(share)) + by;
  return model.months[index]?.start ?? null;
}

function roundTo(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '');
}

export function densityPath(model: ScrubberModel, width: number, height: number): string {
  if (model.months.length === 0 || model.peak === 0 || height <= 0) return '';
  const points = model.months.map((month) => {
    const x = width * (1 - month.count / model.peak);
    const y = ((month.start + month.end) / 2) * height;
    return `L${roundTo(x)} ${roundTo(y)}`;
  });
  const right = roundTo(width);
  return `M${right} 0 ${points.join(' ')} L${right} ${roundTo(height)}Z`;
}

export function monthTitle(month: string): string {
  return MONTH_TITLE('UTC').format(new Date(`${month}-15T12:00:00Z`));
}

export function pillText(month: string, items: number): string {
  return `${monthTitle(month)} · ${count(items)}`;
}
