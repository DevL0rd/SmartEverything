import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { MemoryBar, Sparkline } from '../../../components/charts';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { decimal } from '../../../format/number';
import { DemandRegion } from '../../../store/demand-region';
import { useComputerSelect } from '../data/computer-metrics';
import { useSeriesSet } from '../data/series-set';
import { memorySegments } from '../model/computer-memory';
import { sameJson } from '../../../store/same-json';

const MEMORY_TOPICS = ['memory'] as const;
const SERIES = ['summary/memoryPercent'] as const;
const SPARK_HEIGHT = 40;
const GAP_MS = 5000;

function MemorySpark({ deviceId }: { readonly deviceId: string }): ReactNode {
  const [points] = useSeriesSet(deviceId, SERIES);
  return points === undefined || points.length < 2 ? null : (
    <View aria-hidden>
      <Sparkline points={points} colour="viz-blue" height={SPARK_HEIGHT} maxGap={GAP_MS} />
    </View>
  );
}

export function MemoryCard({
  deviceId,
  online,
}: {
  readonly deviceId: string;
  readonly online: boolean;
}): ReactNode {
  const memory = useComputerSelect(deviceId, (parts) => parts.memory, sameJson);
  const bar = memory === undefined ? null : memorySegments(memory);
  if (bar === null && !online) return null;
  return (
    <Card title="Memory">
      <DemandRegion deviceId={deviceId} topics={MEMORY_TOPICS} className="gap-3">
        {bar === null ? (
          <>
            <Skeleton shape="text" />
            <Skeleton shape="line" />
          </>
        ) : (
          <>
            <Text variant="footnote" tone="variant">
              {`${decimal(bar.percent)} % of ${decimal(bar.total)} GB used`}
            </Text>
            <MemoryBar total={bar.total} segments={bar.segments} showTotal={false} />
          </>
        )}
        <MemorySpark deviceId={deviceId} />
      </DemandRegion>
    </Card>
  );
}
