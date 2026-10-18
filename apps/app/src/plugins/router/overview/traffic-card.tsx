import { formatMegabits, type RouterSnapshot, type SpeedTestResult } from '@smarteverything/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { TimeSeriesChart, type ChartPoint } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { cn } from '../../../design/cn';
import { useLiveSeries } from '../../../store/computer-rings';
import type { Device } from '../../../store/state';
import { LiveRangeChart } from '../../shared/live-range-chart';
import { useSourceLive } from '../../shared/use-source-live';
import { rateParts } from './hero-model';
import { ROUTER_DOWNLOAD, ROUTER_UPLOAD, routerReadings } from './router-live';
import { TrafficTable } from './traffic-table';
import {
  TRAFFIC_CHART_RANGE,
  TRAFFIC_HOURS,
  TRAFFIC_RANGES,
  tableRows,
  tableStep,
  trafficSummary,
  withLatest,
  megabitPoints,
  type StoredRange,
  type TrafficRange,
} from './traffic-model';
import { useMegabitSeries } from './use-router-series';

const TABLE_ROWS = 24;
const PHONE_HEIGHT = 180;
const WIDE_HEIGHT = 220;

function Legend({ download, upload, summary }: LegendProps): ReactNode {
  const items = [
    { label: 'Download', swatch: 'bg-viz-1', value: download },
    { label: 'Upload', swatch: 'bg-viz-2', value: upload },
  ] as const;
  return (
    <View
      accessible
      accessibilityLabel={summary}
      className="flex-row flex-wrap items-center gap-x-4 gap-y-1"
    >
      {items.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View aria-hidden className={cn('size-2.5 rounded-full', item.swatch)} />
          <Text variant="footnote">
            {item.label}
            {item.value === null ? '' : ` ${rateParts(item.value).value}`}
          </Text>
        </View>
      ))}
      <Text variant="footnote" tone="variant">
        Mb/s
      </Text>
    </View>
  );
}

interface LegendProps {
  readonly download: number | null;
  readonly upload: number | null;
  readonly summary: string | undefined;
}

function lastOf(points: readonly ChartPoint[]): number | null {
  return points[points.length - 1]?.v ?? null;
}

function liveOf(
  network: RouterSnapshot['network'],
  at: string,
  pick: 'downloadMbps' | 'uploadMbps',
  fresh: boolean,
): { readonly at: number; readonly value: number } | null {
  return fresh && network !== null ? { at: Date.parse(at), value: network[pick] } : null;
}

interface TrafficData {
  readonly state: 'loading' | 'ready';
  readonly down: readonly ChartPoint[];
  readonly up: readonly ChartPoint[];
}

function useTrafficData(device: Device, snapshot: RouterSnapshot, range: StoredRange): TrafficData {
  const hours = TRAFFIC_HOURS[range];
  const download = useMegabitSeries(device.id, 'download_rate', hours);
  const upload = useMegabitSeries(device.id, 'upload_rate', hours);
  const fresh = snapshot.connection.state === 'online';
  return {
    state: download.state === 'loading' || upload.state === 'loading' ? 'loading' : 'ready',
    down: withLatest(download.points, liveOf(snapshot.network, snapshot.at, 'downloadMbps', fresh)),
    up: withLatest(upload.points, liveOf(snapshot.network, snapshot.at, 'uploadMbps', fresh)),
  };
}

function Chart({
  data,
  range,
  fresh,
  last,
}: {
  readonly data: TrafficData;
  readonly range: StoredRange;
  readonly fresh: boolean;
  readonly last: SpeedTestResult | null;
}): ReactNode {
  const wide = useIdiom() === 'pointer';
  const marker = last === null ? undefined : { at: Date.parse(last.at), label: 'Speed test' };
  return (
    <View aria-hidden className={fresh ? '' : 'opacity-60'}>
      <TimeSeriesChart
        range={TRAFFIC_CHART_RANGE[range]}
        fit
        unit="Mb/s"
        height={wide ? WIDE_HEIGHT : PHONE_HEIGHT}
        formatValue={(value) => rateParts(value).value}
        series={[
          { label: 'Download', colour: 'viz-1', points: data.down },
          { label: 'Upload', colour: 'viz-2', points: data.up },
        ]}
        {...(marker === undefined || range === '7d' ? {} : { marker })}
      />
    </View>
  );
}

interface PlotProps {
  readonly device: Device;
  readonly snapshot: RouterSnapshot;
  readonly table: boolean;
  readonly last: SpeedTestResult | null;
}

function Shown({
  data,
  table,
  chart,
}: {
  readonly data: TrafficData;
  readonly table: boolean;
  readonly chart: ReactNode;
}): ReactNode {
  if (data.down.length === 0) {
    return (
      <EmptyState
        compact
        icon="activity"
        title="No traffic yet"
        body="Traffic shows up here after the router has been online for a few minutes."
      />
    );
  }
  const summary = trafficSummary(data.down, (megabits) => formatMegabits(megabits));
  return (
    <View className="gap-3">
      <Legend
        download={lastOf(data.down)}
        upload={lastOf(data.up)}
        summary={summary ?? undefined}
      />
      {table ? (
        <TrafficTable
          rows={tableRows(data.down, data.up, tableStep(data.down.length, TABLE_ROWS))}
        />
      ) : (
        chart
      )}
    </View>
  );
}

function StoredPlot({ range, ...plot }: PlotProps & { readonly range: StoredRange }): ReactNode {
  const data = useTrafficData(plot.device, plot.snapshot, range);
  if (data.state === 'loading') {
    return <Skeleton shape="block" className="h-45" />;
  }
  return (
    <Shown
      data={data}
      table={plot.table}
      chart={
        <Chart
          data={data}
          range={range}
          fresh={plot.snapshot.connection.state === 'online'}
          last={plot.last}
        />
      }
    />
  );
}

function LivePlot({ device, snapshot, table }: PlotProps): ReactNode {
  const wide = useIdiom() === 'pointer';
  const download = useLiveSeries(device.id, ROUTER_DOWNLOAD);
  const upload = useLiveSeries(device.id, ROUTER_UPLOAD);
  const down = useMemo(() => megabitPoints(download), [download]);
  const up = useMemo(() => megabitPoints(upload), [upload]);
  const fresh = snapshot.connection.state === 'online';
  return (
    <Shown
      data={{ state: 'ready', down, up }}
      table={table}
      chart={
        <View aria-hidden className={fresh ? '' : 'opacity-60'}>
          <LiveRangeChart
            label="Traffic"
            unit="Mb/s"
            height={wide ? WIDE_HEIGHT : PHONE_HEIGHT}
            formatValue={(value) => rateParts(value).value}
            series={[
              { label: 'Download', colour: 'viz-1', points: down },
              { label: 'Upload', colour: 'viz-2', points: up },
            ]}
          />
        </View>
      }
    />
  );
}

function Plot({ range, ...plot }: PlotProps & { readonly range: TrafficRange }): ReactNode {
  return range === 'live' ? <LivePlot {...plot} /> : <StoredPlot range={range} {...plot} />;
}

function lanLine(snapshot: RouterSnapshot): string {
  const { network } = snapshot;
  if (network === null || snapshot.connection.state !== 'online') {
    return 'Inside the home: —';
  }
  return `Inside the home: ${formatMegabits(network.lanDownloadMbps)} in · ${formatMegabits(network.lanUploadMbps)} out`;
}

export function TrafficCard({
  device,
  snapshot,
  last,
}: {
  readonly device: Device;
  readonly snapshot: RouterSnapshot;
  readonly last: SpeedTestResult | null;
}): ReactNode {
  const [range, setRange] = useState<TrafficRange>('live');
  useSourceLive(device, snapshot, routerReadings);
  const [table, setTable] = useState(false);
  return (
    <Card
      title="Traffic"
      action={
        <Button
          label={table ? 'Show as chart' : 'Show as table'}
          variant="text"
          onPress={() => {
            setTable(!table);
          }}
        />
      }
    >
      <View className="items-start">
        <Segmented label="Range" options={TRAFFIC_RANGES} value={range} onChange={setRange} />
      </View>
      <Plot device={device} snapshot={snapshot} range={range} table={table} last={last} />
      <Text variant="footnote" tone="variant">
        {lanLine(snapshot)}
      </Text>
    </Card>
  );
}
