import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { type HistoryRow, type PresentedCapability } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { TimeSeriesChart, type ChartPoint } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Skeleton } from '../../../components/skeleton';
import { useHistory } from '../../../queries/history';
import type { Device } from '../../../store/state';
import { useDeviceModel } from '../model/device-model';
import {
  HISTORY_RANGES,
  RANGE_HOURS,
  historyMetrics,
  type HistoryRangeKey,
} from '../model/history-model';

function pointsOf(rows: readonly HistoryRow[], deviceId: string): readonly ChartPoint[] {
  return rows.flatMap((row) =>
    row.device_id === deviceId && typeof row.value === 'number'
      ? [{ t: Date.parse(row.observed_at), v: row.value }]
      : [],
  );
}

function Chart({
  device,
  metric,
  range,
}: {
  readonly device: Device;
  readonly metric: PresentedCapability;
  readonly range: HistoryRangeKey;
}): ReactNode {
  const history = useHistory([metric.key], RANGE_HOURS[range]);
  if (history.isPending) {
    return <Skeleton shape="block" className="h-50" />;
  }
  if (history.isError) {
    return <ErrorState error={history.error} retry={() => void history.refetch()} />;
  }
  const points = pointsOf(history.data, device.id);
  return (
    <View className="gap-2">
      <TimeSeriesChart
        series={[{ points, colour: 'viz-1', label: metric.label }]}
        range={range}
        fit
        height={220}
        {...(metric.unit === null ? {} : { unit: metric.unit })}
      />
    </View>
  );
}

export function HistorySection({ device }: { readonly device: Device }): ReactNode {
  const model = useDeviceModel(device);
  const [extras, setExtras] = useState(false);
  const [range, setRange] = useState<HistoryRangeKey>('24h');
  const metrics = historyMetrics(model.presentation, extras);
  const [chosen, setChosen] = useState<string | null>(null);
  const metric = metrics.find((candidate) => candidate.key === chosen) ?? metrics[0];
  if (metric === undefined) {
    return (
      <EmptyState
        icon="activity"
        title="Nothing to chart"
        body="This device reports no numbers to keep."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <Card>
        <View className="gap-4">
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <View className="min-w-48 flex-1">
              <Select
                label="Metric"
                options={metrics.map((candidate) => ({
                  value: candidate.key,
                  label: candidate.label,
                }))}
                value={metric.key}
                onChange={setChosen}
              />
            </View>
            <Segmented label="Range" options={HISTORY_RANGES} value={range} onChange={setRange} />
          </View>
          <Chart device={device} metric={metric} range={range} />
        </View>
      </Card>
      <List>
        <SwitchRow
          title="Show provider metrics"
          subtitle="Adds the extra numbers your provider reports"
          value={extras}
          onChange={setExtras}
        />
      </List>
    </View>
  );
}
