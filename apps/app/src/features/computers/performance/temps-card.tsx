import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { readableLabel } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { LiveFact } from '../components/live-fact';
import { useComputerSelect } from '../data/computer-metrics';
import { whole } from '../model/computer-charts';
import type { ViewRange } from '../model/performance';
import { RangeChart, type RangeLine } from './range-chart';

const TOPICS = ['cpu', 'gpu', 'disks', 'sensors'] as const;
const DEFAULT_MAX_RPM = 3500;

function Fans({
  deviceId,
  stale,
}: {
  readonly deviceId: string;
  readonly stale: boolean;
}): ReactNode {
  const fans = useComputerSelect(deviceId, (parts) => parts.sensors?.fans, sameJson);
  if (fans === undefined || fans.length === 0) return null;
  return (
    <View className="gap-3">
      {fans.map((fan, index) => (
        <View key={`${fan.label}-${String(index)}`} className="gap-1">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text variant="callout" numberOfLines={1} className="min-w-0 flex-1">
              {readableLabel(fan.label)}
            </Text>
            <LiveFact
              deviceId={deviceId}
              label={readableLabel(fan.label)}
              showLabel={false}
              unit="rpm"
              widest="8888"
              stale={stale}
              read={(parts) => parts.sensors?.fans[index]?.rpm ?? null}
            />
          </View>
          <ProgressBar
            progress={fan.rpm / (fan.maxRpm ?? DEFAULT_MAX_RPM)}
            colour="viz-blue"
            label={`${readableLabel(fan.label)} ${whole(fan.rpm)} rpm`}
          />
        </View>
      ))}
    </View>
  );
}

function useTempLines(deviceId: string, gpuId: string | null): readonly RangeLine[] {
  const drives = useComputerSelect(deviceId, (parts) =>
    (parts.disks?.disks ?? [])
      .filter((disk) => disk.temperature !== null)
      .map((disk) => disk.device)
      .join('\n'),
  );
  return useMemo(() => {
    const hottest =
      drives === '' ? [] : drives.split('\n').map((name) => `disks/${name}.temperature`);
    const lines: RangeLine[] = [
      { ids: ['cpu/temperature'], metric: 'cpu_temperature', label: 'CPU', colour: 'viz-blue' },
    ];
    if (gpuId !== null) {
      lines.push({
        ids: [`gpu/${gpuId}.temperature`],
        metric: 'gpu_temperature',
        label: 'GPU',
        colour: 'viz-magenta',
      });
    }
    if (hottest.length > 0) {
      lines.push({
        ids: hottest,
        combine: 'max',
        metric: null,
        label: 'Hottest drive',
        colour: 'viz-violet',
      });
    }
    return lines;
  }, [drives, gpuId]);
}

export function TempsCard({
  deviceId,
  online,
  range,
  gpuId,
}: {
  readonly deviceId: string;
  readonly online: boolean;
  readonly range: ViewRange;
  readonly gpuId: string | null;
}): ReactNode {
  const lines = useTempLines(deviceId, gpuId);
  return (
    <Card title="Temperatures and fans" className="flex-1">
      <DemandRegion deviceId={deviceId} topics={TOPICS} className="gap-3">
        <RangeChart
          deviceId={deviceId}
          range={range}
          lines={lines}
          yDomain={[20, 100]}
          label="Temperature chart"
          unit="°C"
          formatValue={whole}
          offline={!online}
        />
        <Fans deviceId={deviceId} stale={!online} />
      </DemandRegion>
    </Card>
  );
}
