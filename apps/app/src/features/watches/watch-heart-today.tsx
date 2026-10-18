import type { ReactNode } from 'react';
import { View } from 'react-native';
import { TimeSeriesChart, type ChartSeries } from '../../components/charts';
import { Text } from '../../components/text';
import { decimal } from '../../format/number';
import { startOfDayKey, DAY_MS } from '../../format/time';
import { useDayKey } from '../../store/clock';
import type { Device } from '../../store/state';
import { useDayFacts, useHeartToday } from './watch-health-data';

const CHART_HEIGHT = 170;

export function HeartToday({ device }: { readonly device: Device }): ReactNode {
  const points = useHeartToday(true);
  const resting = useDayFacts(device).resting;
  const day = useDayKey();
  if (points === undefined || points.length === 0) {
    return null;
  }
  const from = startOfDayKey(day);
  const series: readonly ChartSeries[] = [
    { label: 'Heart rate', colour: 'heart', points },
    ...(resting === null
      ? []
      : [
          {
            label: 'Resting',
            colour: 'viz-2' as const,
            points: [
              { t: from, v: resting },
              { t: from + DAY_MS, v: resting },
            ],
          },
        ]),
  ];
  return (
    <View className="gap-2">
      <Text variant="body-strong">Heart today</Text>
      <View className="gap-2">
        <TimeSeriesChart
          series={series}
          range="day"
          unit="bpm"
          height={CHART_HEIGHT}
          label="Heart rate today"
        />
        {resting === null ? null : (
          <Text variant="footnote" tone="variant" className="tabular">
            {`Resting ${decimal(resting)} bpm`}
          </Text>
        )}
      </View>
    </View>
  );
}
