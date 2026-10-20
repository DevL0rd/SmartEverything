import type { PrinterStatsView } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc, Bars, CalendarHeatmap, HourHeatmap } from '../../../components/charts';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';

export function Calendar({
  view,
  today,
}: {
  readonly view: PrinterStatsView;
  readonly today: string;
}): ReactNode {
  return view.stats.heatmap.length === 0 ? null : (
    <Card title="Print calendar" icon="calendar">
      <CalendarHeatmap
        days={view.stats.heatmap}
        today={today}
        split={2}
        label="Pages printed on each of the last 365 days; hatched days were not recorded"
      />
    </Card>
  );
}

export function WeekdayHours({ view }: { readonly view: PrinterStatsView }): ReactNode {
  return view.stats.weekdayHour.every((row) => row.every((value) => value === 0)) ? null : (
    <Card title="Busy hours" icon="clock">
      <HourHeatmap matrix={view.stats.weekdayHour} label="Pages printed by weekday and hour" />
    </Card>
  );
}

export function Reliability({ view }: { readonly view: PrinterStatsView }): ReactNode {
  const { reliability } = view.stats;
  const percent = reliability.onlinePercent;
  return (
    <Card title="Reliability" icon="shield">
      <View className="gap-3">
        <View className="flex-row items-center gap-4">
          <Arc
            value={percent === null ? 0 : percent / 100}
            size={88}
            thickness={8}
            colour={percent !== null && percent < 90 ? 'warning' : 'positive'}
            trackColour="track"
          />
          <View className="min-w-0 flex-1 gap-1">
            <Text variant="title-3" className="tabular">
              {percent === null ? 'Not enough data' : `${percent.toFixed(1)}% online`}
            </Text>
            <Text variant="caption" tone="variant">
              {String(reliability.restarts)} restarts · {String(reliability.jams)} jams ·{' '}
              {String(reliability.errors)} errors
            </Text>
          </View>
        </View>
        {reliability.months.length === 0 ? null : (
          <Bars
            bars={reliability.months.map((month) => ({
              key: month.month,
              value: month.jams + month.errors,
              label: month.month.slice(5),
            }))}
            colour="critical"
            label="Jams and errors in each month"
          />
        )}
      </View>
    </Card>
  );
}

export function Cost({ view }: { readonly view: PrinterStatsView }): ReactNode {
  const { cost, budget } = view;
  if (cost === null) return null;
  return (
    <Card title="Cost" icon="trendUp">
      <View className="gap-2">
        <Text variant="body" className="tabular">
          This month{' '}
          {cost.month === null ? 'not known' : `${cost.month.toFixed(2)} ${cost.currency}`}
          {budget.monthlyCap === null ? '' : ` of ${budget.monthlyCap.toFixed(2)} ${cost.currency}`}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {cost.perMonoPage === null
            ? ''
            : `Black and white ${cost.perMonoPage.toFixed(3)} per page`}
          {cost.perColourPage === null ? '' : ` · colour ${cost.perColourPage.toFixed(3)} per page`}
        </Text>
        {cost.months.length === 0 ? null : (
          <Bars
            bars={cost.months.map((entry) => ({
              key: entry.month,
              value: entry.amount,
              label: entry.month.slice(5),
            }))}
            colour="warning"
            label={`Spend per month in ${cost.currency}`}
            formatValue={(value) => value.toFixed(2)}
          />
        )}
      </View>
    </Card>
  );
}
