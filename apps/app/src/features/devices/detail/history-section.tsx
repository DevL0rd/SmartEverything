import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { type PresentedCapability } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { TimeSeriesChart } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { SwitchRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Select } from '../../../components/select';
import { Skeleton } from '../../../components/skeleton';
import type { ColourRole } from '../../../design/tokens';
import { useDeviceSeries } from '../../../queries/history';
import type { Device } from '../../../store/state';
import { useDeviceModel } from '../model/device-model';
import {
  HISTORY_RANGES,
  RANGE_HOURS,
  historyMetrics,
  type HistoryRangeKey,
} from '../model/history-model';
import { background } from '@smarteverything/logging';

export function MetricChart({
  device,
  metric,
  range,
  colour = 'viz-1',
  height = 220,
}: {
  readonly device: Device;
  readonly metric: PresentedCapability;
  readonly range: HistoryRangeKey;
  readonly colour?: ColourRole;
  readonly height?: number;
}): ReactNode {
  const history = useDeviceSeries(device.id, metric.key, RANGE_HOURS[range]);
  if (history.isPending) {
    return <Skeleton shape="block" className="h-50" />;
  }
  if (history.isError) {
    return (
      <ErrorState
        error={history.error}
        retry={() => {
          background(history.refetch(), 'history.refetch_failed');
        }}
      />
    );
  }
  return (
    <View className="gap-2">
      <TimeSeriesChart
        series={[{ points: history.data, colour, label: metric.label }]}
        range={range}
        fit
        height={height}
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
          <MetricChart device={device} metric={metric} range={range} />
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
