import { useMemo, type ReactNode } from 'react';
import { Card } from '../../../components/card';
import { MemoryBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { sameJson } from '../../../store/same-json';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect } from '../data/computer-metrics';
import { PERCENT_DOMAIN, whole } from '../model/computer-charts';
import { memorySegments } from '../model/computer-memory';
import type { ViewRange } from '../model/performance';
import { RangeChart, type RangeLine } from './range-chart';

const TOPICS = ['memory'] as const;
const BYTES_PER_GB = 1_000_000_000;
const USED: RangeLine = {
  ids: ['summary/memoryPercent'],
  metric: 'memory_used',
  label: 'Used',
  colour: 'viz-blue',
};
const SWAP: RangeLine = {
  ids: ['summary/swapPercent'],
  metric: 'swap_used',
  label: 'Swap',
  colour: 'viz-violet',
};

export function PerformanceMemoryCard({
  deviceId,
  online,
  range,
}: {
  readonly deviceId: string;
  readonly online: boolean;
  readonly range: ViewRange;
}): ReactNode {
  const memory = useComputerSelect(deviceId, (parts) => parts.memory, sameJson);
  const hasSwap = (memory?.swapTotalBytes ?? 0) > 0;
  const lines = useMemo((): readonly RangeLine[] => (hasSwap ? [USED, SWAP] : [USED]), [hasSwap]);
  const bar = memory === undefined ? null : memorySegments(memory);
  const swap =
    memory === undefined || !hasSwap
      ? ''
      : ` · swap ${decimal(memory.swapUsedBytes / BYTES_PER_GB, 1)} of ${decimal(Math.round(memory.swapTotalBytes / BYTES_PER_GB))} GB`;
  return (
    <Card title="Memory" className="flex-1">
      <DemandRegion deviceId={deviceId} topics={TOPICS} className="gap-3">
        {bar === null ? null : (
          <>
            <Text variant="footnote" tone="variant">
              {`${decimal(bar.total)} GB${swap}`}
            </Text>
            <MemoryBar total={bar.total} segments={bar.segments} showTotal={false} />
          </>
        )}
        <RangeChart
          deviceId={deviceId}
          range={range}
          lines={lines}
          yDomain={PERCENT_DOMAIN}
          label="Memory chart"
          unit="%"
          formatValue={whole}
          height={120}
          offline={!online}
        />
      </DemandRegion>
    </Card>
  );
}
