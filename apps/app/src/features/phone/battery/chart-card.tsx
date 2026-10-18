import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { StateTimeline, TimeSeriesChart, type ChartSeries } from '../../../components/charts';
import { ErrorState } from '../../../components/error-state';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { HOUR_MS } from '../../../format/time';
import { useMinute } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { usePhoneBattery, type BatteryRange } from '../data/phone-history';
import { chargingSegmentsOf, chargingSummary } from '../model/charging-segments';

const CHART_HEIGHT = 170;
const STRIP_HEIGHT = 14;
const PERCENT_RANGE = [0, 100] as const;
const RANGE_HOURS: Readonly<Record<BatteryRange, number>> = { '24h': 24, '7d': 168 };
const RANGE_OPTIONS = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
] as const;

const CHARGING_COLOURS = { charging: 'positive', battery: 'surface-3' } as const;

function ChargingStrip({
  now,
  range,
  spans,
}: {
  readonly now: number;
  readonly range: BatteryRange;
  readonly spans: Parameters<typeof chargingSegmentsOf>[0];
}): ReactNode {
  const from = now - RANGE_HOURS[range] * HOUR_MS;
  const segments = chargingSegmentsOf(spans, from, now);
  return (
    <View className="gap-1">
      <Text variant="caption" tone="variant">
        Charging
      </Text>
      <StateTimeline
        segments={segments}
        colours={CHARGING_COLOURS}
        label={chargingSummary(spans)}
        height={STRIP_HEIGHT}
        from={from}
        to={now}
      />
    </View>
  );
}

export function BatteryChartCard({ device }: { readonly device: Device }): ReactNode {
  const [range, setRange] = useState<BatteryRange>('24h');
  const now = useMinute();
  const battery = usePhoneBattery(device.id, range, now);
  const series = useMemo(
    (): readonly ChartSeries[] => [
      { label: 'Battery', colour: 'viz-blue', points: battery.points ?? [] },
    ],
    [battery.points],
  );
  return (
    <Card
      title="Battery history"
      icon="battery"
      action={<Segmented label="Range" options={RANGE_OPTIONS} value={range} onChange={setRange} />}
    >
      {battery.error !== null ? (
        <ErrorState error={battery.error} retry={battery.retry} />
      ) : battery.points === undefined ? (
        <Skeleton shape="block" className="h-44" />
      ) : (
        <>
          <TimeSeriesChart
            series={series}
            range={range}
            height={CHART_HEIGHT}
            unit="%"
            yDomain={PERCENT_RANGE}
            label={`Battery, last ${range === '24h' ? '24 hours' : '7 days'}`}
          />
          {battery.charging === undefined ? null : (
            <ChargingStrip now={now} range={range} spans={battery.charging} />
          )}
        </>
      )}
    </Card>
  );
}
