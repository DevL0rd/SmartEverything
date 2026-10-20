import type { PrinterBucket, PrinterStatsView } from '@smarteverything/domain';
import type { Bar } from '../../../components/charts';
import type { DonutSlice } from '../../../components/charts';
import type { MetricItem } from '../../../components/metric-strip';
import type { TimelineSegment } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { deltaChip, pagesMeaning, shareDelta, type DeltaChip } from './delta';
import { countLabel } from './format';

export type StatsPeriod = 'day' | 'week' | 'month' | 'year';

export const PERIOD_OPTIONS: readonly { readonly value: StatsPeriod; readonly label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const MONTH = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'] as const;

function labelOf(period: StatsPeriod, key: string): string {
  if (period === 'day') return key.slice(11, 13);
  if (period === 'year') return MONTH[Number(key.slice(5, 7)) - 1] ?? '';
  if (period === 'week') return WEEKDAY[new Date(`${key}T12:00:00Z`).getUTCDay()] ?? '';
  return key.slice(8, 10);
}

function every(period: StatsPeriod, index: number): boolean {
  if (period === 'day') return index % 6 === 0;
  if (period === 'month') return index % 5 === 0;
  return true;
}

export function barsOf(period: StatsPeriod, buckets: readonly PrinterBucket[]): readonly Bar[] {
  return buckets.map((bucket, index) => ({
    key: bucket.key,
    value: bucket.covered ? bucket.pages : 0,
    ...(every(period, index) ? { label: labelOf(period, bucket.key) } : {}),
  }));
}

export function gapNote(
  buckets: readonly PrinterBucket[],
  firstRecorded: string | null,
): string | null {
  if (firstRecorded === null) return null;
  const missing = buckets.filter((bucket) => !bucket.covered && bucket.key >= firstRecorded).length;
  return missing === 0
    ? null
    : `${countLabel(missing, 'bar')} not recorded because the hub could not reach the printer.`;
}

function withDelta(delta: DeltaChip | null): Pick<MetricItem, 'caption'> | Record<never, never> {
  return delta === null ? {} : { caption: delta.text };
}

export function totalsItems(view: PrinterStatsView): readonly MetricItem[] {
  const { totals, delta } = view.stats;
  const goal = view.budget.target !== null;
  return [
    {
      key: 'pages',
      label: 'Pages',
      value: String(Math.round(totals.pages)),
      ...withDelta(deltaChip(delta.pages, pagesMeaning(goal))),
    },
    {
      key: 'jobs',
      label: 'Jobs',
      value: String(totals.jobs),
      ...withDelta(deltaChip(delta.jobs, 'neutral')),
    },
    {
      key: 'sheets',
      label: 'Sheets',
      value: String(Math.round(totals.sheets)),
      ...withDelta(deltaChip(delta.sheets, 'neutral')),
    },
    {
      key: 'colour',
      label: 'Colour share',
      value: totals.colorShare === null ? 'n/a' : `${String(Math.round(totals.colorShare * 100))}%`,
      ...withDelta(shareDelta(delta.colorShare)),
    },
    {
      key: 'duplex',
      label: 'Two-sided',
      value:
        totals.duplexShare === null ? 'n/a' : `${String(Math.round(totals.duplexShare * 100))}%`,
      ...withDelta(shareDelta(delta.duplexShare)),
    },
    {
      key: 'saved',
      label: 'Paper saved',
      value: String(Math.round(totals.paperSaved)),
      unit: 'sheets',
      ...withDelta(deltaChip(delta.paperSaved, 'more-is-better')),
    },
  ];
}

export function splitSlices(view: PrinterStatsView): readonly DonutSlice[] {
  const { color, mono } = view.stats.totals;
  const slices: readonly DonutSlice[] = [
    { key: 'colour', value: color, colour: 'viz-magenta', label: 'Colour' },
    { key: 'mono', value: mono, colour: 'on-surface-variant', label: 'Black and white' },
  ];
  return slices.filter((slice) => slice.value > 0);
}

export function laneSegments(
  view: PrinterStatsView,
): readonly TimelineSegment<PrinterStatsView['states']['lane'][number]['state']>[] {
  return view.states.lane.map((entry) => ({
    start: Date.parse(entry.from),
    end: Date.parse(entry.to),
    state: entry.state,
  }));
}

const STATE_COLOUR: Readonly<Record<string, ColourRole>> = {
  idle: 'positive',
  printing: 'primary',
  stopped: 'critical',
  asleep: 'on-surface-faint',
  offline: 'outline',
};

export function stateShareSlices(view: PrinterStatsView): readonly DonutSlice[] {
  return view.states.shares
    .filter((share) => share.seconds > 0)
    .map((share) => ({
      key: share.state,
      value: share.seconds,
      colour: STATE_COLOUR[share.state] ?? 'outline',
      label: share.state.charAt(0).toUpperCase() + share.state.slice(1),
    }));
}

export function streakLine(current: number, longest: number, noun: string): string {
  if (current === 0 && longest === 0) return `No ${noun} streak yet`;
  return `${countLabel(current, 'day')} now · longest ${countLabel(longest, 'day')}`;
}
