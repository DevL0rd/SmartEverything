import { useMemo, type ReactNode } from 'react';
import { Banner } from '../../../components/banner';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect } from '../data/computer-metrics';
import { whole } from '../model/computer-charts';
import type { ViewRange } from '../model/performance';
import { RangeChart, type RangeLine } from './range-chart';

const TOPICS = ['cpu', 'gpu', 'power'] as const;

function Subtitle({ deviceId }: { readonly deviceId: string }): ReactNode {
  const line = useComputerSelect(deviceId, (parts) => {
    const total = parts.power?.totalWatts ?? parts.summary?.totalWatts ?? null;
    if (total === null) return null;
    const draw = parts.power?.batteryWatts ?? null;
    const battery = draw === null ? '' : ` · battery ${decimal(Math.round(draw))} W`;
    return `${decimal(Math.round(total))} W total${battery}`;
  });
  return line === null ? null : (
    <Text variant="footnote" tone="variant" className="tabular">
      {line}
    </Text>
  );
}

function usePowerLines(gpuId: string | null): readonly RangeLine[] {
  return useMemo(() => {
    const lines: RangeLine[] = [
      { ids: ['cpu/powerWatts'], metric: 'cpu_power', label: 'CPU', colour: 'viz-blue' },
    ];
    if (gpuId !== null) {
      lines.push({
        ids: [`gpu/${gpuId}.powerWatts`],
        metric: 'gpu_power',
        label: 'GPU',
        colour: 'viz-magenta',
      });
    }
    return lines;
  }, [gpuId]);
}

function PowerBody({
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
  const lines = usePowerLines(gpuId);
  return (
    <>
      <Subtitle deviceId={deviceId} />
      <RangeChart
        deviceId={deviceId}
        range={range}
        lines={lines}
        yDomain="sticky"
        label="Power chart"
        unit="W"
        formatValue={whole}
        offline={!online}
        stack
      />
    </>
  );
}

export function PowerCard({
  deviceId,
  online,
  name,
  range,
  gpuId,
  permitted,
}: {
  readonly deviceId: string;
  readonly online: boolean;
  readonly name: string;
  readonly range: ViewRange;
  readonly gpuId: string | null;
  readonly permitted: boolean;
}): ReactNode {
  return (
    <Card title="Power draw" className="flex-1">
      <DemandRegion deviceId={deviceId} topics={TOPICS} className="gap-3">
        {permitted ? (
          <PowerBody deviceId={deviceId} online={online} range={range} gpuId={gpuId} />
        ) : (
          <Banner
            tone="warning"
            title="Power use needs permission"
            body={`Power use needs read access to the processor’s energy counter on ${name}. Allow it on the computer, then come back.`}
            wrapBody
          />
        )}
      </DemandRegion>
    </Card>
  );
}
