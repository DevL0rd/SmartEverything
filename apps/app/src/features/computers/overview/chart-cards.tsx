import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { useAreaWidth } from '../../../design/size-class';
import { twoColumnsAt } from '../model/sections';
import { DemandRegion } from '../../../store/demand-region';
import { LiveSeriesChart, type LiveLine } from '../components/live-series-chart';
import { useComputerSelect } from '../data/computer-metrics';
import {
  CHART_KINDS,
  CPU_LINES,
  GPU_LINES,
  NET_LINES,
  diskLines,
  type OverviewChart,
} from '../model/computer-charts';

const CHART_HEIGHT = 150;

function pairsOf(kinds: readonly OverviewChart[]): readonly (readonly OverviewChart[])[] {
  return kinds.flatMap((_, index) => (index % 2 === 0 ? [kinds.slice(index, index + 2)] : []));
}

function useLines(deviceId: string, kind: OverviewChart): readonly LiveLine[] {
  const devices = useComputerSelect(deviceId, (parts) =>
    parts.disks === undefined ? '' : parts.disks.disks.map((disk) => disk.device).join('\n'),
  );
  return useMemo(() => {
    if (kind === 'cpu') return CPU_LINES;
    if (kind === 'gpu') return GPU_LINES;
    if (kind === 'net') return NET_LINES;
    return diskLines(devices === '' ? [] : devices.split('\n'));
  }, [kind, devices]);
}

function ChartBody({
  deviceId,
  kind,
  offline,
  height,
}: {
  readonly deviceId: string;
  readonly kind: OverviewChart;
  readonly offline: boolean;
  readonly height: number;
}): ReactNode {
  const spec = CHART_KINDS[kind];
  const lines = useLines(deviceId, kind);
  return (
    <DemandRegion deviceId={deviceId} topics={spec.topics}>
      <LiveSeriesChart
        deviceId={deviceId}
        lines={lines}
        yDomain={spec.yDomain}
        label={spec.label}
        formatValue={spec.format}
        height={height}
        offline={offline}
        {...(spec.unit === undefined ? {} : { unit: spec.unit })}
      />
    </DemandRegion>
  );
}

function ChartCard({
  deviceId,
  kind,
  offline,
}: {
  readonly deviceId: string;
  readonly kind: OverviewChart;
  readonly offline: boolean;
}): ReactNode {
  return (
    <Card title={CHART_KINDS[kind].title} className="min-w-0 flex-1 basis-0">
      <ChartBody deviceId={deviceId} kind={kind} offline={offline} height={CHART_HEIGHT} />
    </Card>
  );
}

function SwitchedChart({
  deviceId,
  kinds,
  offline,
}: {
  readonly deviceId: string;
  readonly kinds: readonly OverviewChart[];
  readonly offline: boolean;
}): ReactNode {
  const [kind, setKind] = useState<OverviewChart>('cpu');
  return (
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="body-strong">{offline ? 'Last 2 minutes' : 'Live · last 2 min'}</Text>
        <Segmented
          label="Chart"
          value={kind}
          onChange={setKind}
          options={kinds.map((entry) => ({
            value: entry,
            label: CHART_KINDS[entry].short,
          }))}
        />
      </View>
      <ChartBody deviceId={deviceId} kind={kind} offline={offline} height={CHART_HEIGHT} />
    </Card>
  );
}

export function OverviewCharts({
  deviceId,
  hasGpu,
  offline,
}: {
  readonly deviceId: string;
  readonly hasGpu: boolean;
  readonly offline: boolean;
}): ReactNode {
  const wide = twoColumnsAt(useAreaWidth());
  const kinds: readonly OverviewChart[] = hasGpu
    ? ['cpu', 'gpu', 'net', 'disk']
    : ['cpu', 'net', 'disk'];
  if (!wide) return <SwitchedChart deviceId={deviceId} kinds={kinds} offline={offline} />;
  return (
    <View className="gap-4">
      {pairsOf(kinds).map((pair) => (
        <View key={pair.join()} className="flex-row gap-4">
          {pair.map((kind) => (
            <ChartCard key={kind} deviceId={deviceId} kind={kind} offline={offline} />
          ))}
        </View>
      ))}
    </View>
  );
}
