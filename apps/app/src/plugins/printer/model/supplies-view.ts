import type { PrinterSupplyView } from '@smarteverything/domain';
import type { ChartSeries } from '../../../components/charts/chart-model';
import type { ViewOf } from '../data/printer-api';
import { daysLabel } from './format';

type Supplies = ViewOf<'supplies'>;

const SLOT_ROLE: Readonly<Partial<Record<PrinterSupplyView['slot'], ChartSeries['colour']>>> = {
  black: 'on-surface',
  'light-black': 'on-surface-variant',
  cyan: 'viz-blue',
  'light-cyan': 'humidity',
  magenta: 'viz-magenta',
  'light-magenta': 'heart',
  yellow: 'caution',
  red: 'critical',
  green: 'positive',
  blue: 'info',
  orange: 'warning',
};

const SPARE_ROLES: readonly ChartSeries['colour'][] = [
  'viz-1',
  'viz-2',
  'viz-3',
  'viz-4',
  'viz-5',
  'viz-6',
];

export function lineRole(supply: PrinterSupplyView, index: number): ChartSeries['colour'] {
  if (!supply.consumed) return 'on-surface-variant';
  return SLOT_ROLE[supply.slot] ?? SPARE_ROLES[index % SPARE_ROLES.length] ?? 'primary';
}

export function seriesOf(
  view: Supplies,
  supply: PrinterSupplyView,
  colour: ChartSeries['colour'],
): readonly ChartSeries[] {
  const line = view.lines.find((entry) => entry.key === supply.key);
  if (line === undefined) return [];
  const level = line.points.map((point) => ({ t: Date.parse(point.at), v: point.level }));
  const forecast = line.forecast.map((point) => ({ t: Date.parse(point.at), v: point.level }));
  return [
    { points: level, colour, label: `${supply.name} level` },
    ...(forecast.length < 2
      ? []
      : [
          {
            points: forecast,
            colour: 'on-surface-faint' as const,
            label: `${supply.name} forecast`,
          },
        ]),
  ];
}

export function burnLine(supply: PrinterSupplyView): string | null {
  const parts = [
    supply.percentPerDay === null ? null : `${supply.percentPerDay.toFixed(1)}% a day`,
    supply.percentPer100Pages === null
      ? null
      : `${supply.percentPer100Pages.toFixed(1)}% per 100 pages`,
  ].filter((part): part is string => part !== null);
  return parts.length === 0 ? null : `Uses about ${parts.join(' · ')}`;
}

export function forecastLine(supply: PrinterSupplyView): string | null {
  const days = daysLabel(supply.daysLeft);
  if (days === null || supply.emptyAt === null) return null;
  return `${days} left, empty around ${new Date(supply.emptyAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function marksOf(view: Supplies, supply: PrinterSupplyView): readonly string[] {
  return view.marks
    .filter((mark) => mark.key === supply.key)
    .map((mark) => {
      const when = new Date(mark.at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      const what =
        mark.kind === 'replaced' ? 'Replaced' : mark.kind === 'low' ? 'Ran low' : 'Ran empty';
      return `${what} ${when}${mark.certain ? '' : ' (estimated)'}`;
    });
}
