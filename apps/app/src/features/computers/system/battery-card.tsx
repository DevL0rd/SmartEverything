import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { ProgressBar, TimeSeriesChart, type ChartSeries } from '../../../components/charts';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { sameJson } from '../../../store/same-json';
import { useMetricHistory } from '../data/computer-history';
import { useComputerSelect } from '../data/computer-metrics';
import { whole } from '../model/computer-charts';
import { batteryView } from './system-model';

const CHART_HEIGHT = 140;
const PERCENT = '%';
const PERCENT_RANGE = [0, 100] as const;
const BATTERY = 'battery_level';

function HistoryChart({ deviceId }: { readonly deviceId: string }): ReactNode {
  const { points, error, retry } = useMetricHistory(deviceId, BATTERY, '24h', true);
  const series = useMemo(
    (): readonly ChartSeries[] => [{ label: 'Battery', colour: 'viz-blue', points: points ?? [] }],
    [points],
  );
  if (error !== null) return <ErrorState error={error} retry={retry} />;
  if (points === undefined) return <Skeleton shape="block" className="h-35" />;
  if (points.length === 0) return null;
  return (
    <TimeSeriesChart
      series={series}
      range="24h"
      height={CHART_HEIGHT}
      unit={PERCENT}
      formatValue={whole}
      yDomain={PERCENT_RANGE}
      label="Battery, last 24 hours"
    />
  );
}

export function BatteryCard({ deviceId }: { readonly deviceId: string }): ReactNode {
  const view = useComputerSelect(
    deviceId,
    (parts) => {
      const battery = parts.system?.battery;
      return battery === undefined || battery === null ? null : batteryView(battery);
    },
    sameJson,
  );
  if (view === null) return null;
  return (
    <Card title="Battery">
      <View className="gap-3">
        <Text variant="callout" tone="variant" className="tabular">
          {view.line}
        </Text>
        <ProgressBar progress={view.percent / 100} colour={view.tone} label="Battery" thick />
        <HistoryChart deviceId={deviceId} />
      </View>
    </Card>
  );
}
