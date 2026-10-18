import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { formatByteRate, type SyncthingSnapshot } from '@smarteverything/domain';
import { Card } from '../../../components/card';
import { Segmented } from '../../../components/segmented';
import { TimeSeriesChart, type ChartPoint } from '../../../components/charts';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { useDeviceSeries } from '../../../queries/history';
import { useLiveSeries } from '../../../store/computer-rings';
import type { Device } from '../../../store/state';
import { LiveRangeChart } from '../../shared/live-range-chart';
import { useSourceLive } from '../../shared/use-source-live';
import { SYNC_DOWNLOAD, SYNC_UPLOAD, syncReadings } from './sync-live';
import {
  hasTransfer,
  TRANSFER_RANGES,
  transferSummary,
  type TransferRange,
} from './transfer-model';

const HOURS = 24;
const PHONE_HEIGHT = 160;
const WIDE_HEIGHT = 200;
const EMPTY: readonly ChartPoint[] = [];

function Legend({ summary }: { readonly summary: string | null }): ReactNode {
  const items = [
    { label: 'In', swatch: 'bg-viz-1' },
    { label: 'Out', swatch: 'bg-viz-2' },
  ] as const;
  return (
    <View
      accessible
      {...(summary === null ? {} : { accessibilityLabel: summary })}
      className="flex-row flex-wrap items-center gap-x-4 gap-y-1"
    >
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View aria-hidden className={cn('size-2.5 rounded-full', item.swatch)} />
          <Text variant="footnote">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Lines({
  wide,
  range,
  incoming,
  outgoing,
}: {
  readonly wide: boolean;
  readonly range: TransferRange;
  readonly incoming: readonly ChartPoint[];
  readonly outgoing: readonly ChartPoint[];
}): ReactNode {
  const series = [
    { label: 'In', colour: 'viz-1', points: incoming },
    { label: 'Out', colour: 'viz-2', points: outgoing },
  ] as const;
  const height = wide ? WIDE_HEIGHT : PHONE_HEIGHT;
  return (
    <View aria-hidden>
      {range === 'live' ? (
        <LiveRangeChart
          label="Transfer"
          height={height}
          formatValue={(value) => formatByteRate(value)}
          series={series}
        />
      ) : (
        <TimeSeriesChart
          range="24h"
          fit
          height={height}
          formatValue={(value) => formatByteRate(value)}
          series={series}
        />
      )}
    </View>
  );
}

export function TransferCard({
  device,
  snapshot,
}: {
  readonly device: Device;
  readonly snapshot: SyncthingSnapshot;
}): ReactNode {
  useSourceLive(device, snapshot, syncReadings);
  const [range, setRange] = useState<TransferRange>('live');
  const stored = range === '24h';
  const storedIn = useDeviceSeries(device.id, 'sync_download_rate', HOURS).data ?? EMPTY;
  const storedOut = useDeviceSeries(device.id, 'sync_upload_rate', HOURS).data ?? EMPTY;
  const liveIn = useLiveSeries(device.id, SYNC_DOWNLOAD);
  const liveOut = useLiveSeries(device.id, SYNC_UPLOAD);
  const wide = useIdiom() === 'pointer';
  const incoming = stored ? storedIn : liveIn;
  const outgoing = stored ? storedOut : liveOut;
  if (!hasTransfer(storedIn, storedOut) && !hasTransfer(liveIn, liveOut)) {
    return null;
  }
  return (
    <Card title="Transfer">
      <View className="items-start">
        <Segmented label="Range" options={TRANSFER_RANGES} value={range} onChange={setRange} />
      </View>
      <Legend summary={transferSummary(incoming, outgoing)} />
      <Lines wide={wide} range={range} incoming={incoming} outgoing={outgoing} />
    </Card>
  );
}
