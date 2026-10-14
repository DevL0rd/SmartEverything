import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { UsagePoint, UsageSeries } from '@smarteverything/domain';
import { Bars } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { CardEmpty, CostCard } from './cost-card';
import { useMoney } from '../../region';
import type { CostWindow } from './costs-range';

const LABELLED_DAYS = 14;

function inRange(point: UsagePoint, window: CostWindow): boolean {
  const start = Date.parse(point.start);
  return start >= Date.parse(window.from) && start < Date.parse(window.to);
}

function labelOf(point: UsagePoint, window: CostWindow, timeZone: string): string {
  const at = new Date(point.start);
  if (window.bucket === 'hour') {
    return at.toLocaleTimeString(undefined, { hour: 'numeric', timeZone });
  }
  return window.days <= LABELLED_DAYS
    ? at.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', timeZone })
    : at.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone });
}

export function CostChart({
  series,
  window,
}: {
  readonly series: UsageSeries;
  readonly window: CostWindow;
}): ReactNode {
  const points = series.points.filter((point) => inRange(point, window));
  const money = useMoney();
  const total = points.reduce((sum, point) => sum + point.cost_micros, 0);
  const incomplete = points.some((point) => (point.unknown_count ?? 0) > 0);
  const hourly = window.bucket === 'hour';
  const average = Math.round(total / Math.max(1, points.length));
  return (
    <CostCard title={hourly ? 'By hour' : 'By day'} icon="activity" accent="viz-1">
      {total === 0 ? (
        <CardEmpty
          icon="activity"
          colour="viz-1"
          title={incomplete ? 'Supplier costs unavailable' : 'Nothing spent in these dates'}
          body={
            incomplete
              ? 'These dates contain requests with unavailable costs. The known total is incomplete.'
              : 'Spend shows up here as the assistant works.'
          }
        />
      ) : (
        <View className="gap-3">
          <View className="flex-row items-end gap-2">
            <Figure value={money.cost(average)} size="m" />
            <Text variant="footnote" tone="variant" className="pb-1">
              {`${hourly ? 'an hour on average' : 'a day on average'}${incomplete ? ' · Known costs only' : ''}`}
            </Text>
          </View>
          <Bars
            bars={points.map((point) => ({
              key: point.start,
              value: point.cost_micros,
              label: labelOf(point, window, series.time_zone),
            }))}
            colour="viz-1"
            height={160}
            label={`Spend ${hourly ? 'by hour' : 'by day'}, ${money.cost(total)} ${incomplete ? 'known total, additional costs unavailable' : 'in total'}`}
            formatValue={money.cost}
          />
        </View>
      )}
    </CostCard>
  );
}
