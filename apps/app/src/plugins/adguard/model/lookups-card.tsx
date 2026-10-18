import type { AdGuardSnapshot, AdGuardStats } from '@smarteverything/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { EmptyState } from '../../../components/empty-state';
import { Segmented } from '../../../components/segmented';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { decimal } from '../../../format/number';
import { useLiveSeries } from '../../../store/computer-rings';
import type { Device } from '../../../store/state';
import { LiveRangeChart } from '../../shared/live-range-chart';
import { periodCaption } from '../stats-period';
import { useSourceLive } from '../../shared/use-source-live';
import { BLOCKED_RATE, LOOKUPS_RATE, LookupRateTracker, splitLookups } from './adguard-live';
import { axisTicks, hourlyStack, summaryOf, tooltipOf, valueTicks } from './chart-model';
import { LookupsTable } from './lookups-table';
import { StackedBars } from './stacked-bars';

const LEGEND = [
  { label: 'Allowed', swatch: 'bg-viz-1 opacity-60' },
  { label: 'Blocked', swatch: 'bg-viz-3' },
] as const;

function Legend({ summary }: { readonly summary: string | null }): ReactNode {
  return (
    <View
      accessible
      {...(summary === null ? {} : { accessibilityLabel: summary })}
      className="flex-row flex-wrap items-center gap-x-4 gap-y-1"
    >
      {LEGEND.map((item) => (
        <View key={item.label} className="flex-row items-center gap-1.5">
          <View aria-hidden className={cn('size-2.5 rounded-xs', item.swatch)} />
          <Text variant="footnote">{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

function Plot({
  stats,
  at,
  table,
}: {
  readonly stats: AdGuardStats;
  readonly at: string;
  readonly table: boolean;
}): ReactNode {
  const [selected, setSelected] = useState<number | null>(null);
  const bars = hourlyStack(stats, at);
  const shown = bars[selected ?? bars.length - 1];
  const unit = stats.timeUnit === 'hours' ? 'hour' : 'day';
  return (
    <View className="gap-3">
      <Legend summary={summaryOf(bars, stats.timeUnit)} />
      {table ? (
        <LookupsTable bars={bars} unit={unit} />
      ) : (
        <>
          <StackedBars
            bars={bars}
            valueTicks={valueTicks(bars)}
            axisTicks={axisTicks(bars, stats.timeUnit)}
            selected={selected}
            onSelect={(index) => {
              setSelected(selected === index ? null : index);
            }}
          />
          {shown === undefined ? null : (
            <Text variant="footnote" className="tabular">
              {tooltipOf(shown)}
            </Text>
          )}
        </>
      )}
    </View>
  );
}

const RANGES = [
  { value: 'live', label: 'Live' },
  { value: 'day', label: '24 h' },
] as const;

type Range = (typeof RANGES)[number]['value'];

function LivePlot({ deviceId }: { readonly deviceId: string }): ReactNode {
  const lookups = useLiveSeries(deviceId, LOOKUPS_RATE);
  const blocked = useLiveSeries(deviceId, BLOCKED_RATE);
  const split = useMemo(() => splitLookups(lookups, blocked), [lookups, blocked]);
  if (lookups.length === 0) {
    return (
      <EmptyState
        compact
        icon="activity"
        title="No lookups yet"
        body="Lookups show up here as devices use AdGuard Home."
      />
    );
  }
  return (
    <View aria-hidden>
      <LiveRangeChart
        label="Lookups"
        unit="/s"
        stack
        formatValue={(value) => decimal(value, 1)}
        series={[
          { label: 'Allowed', colour: 'viz-1', points: split.allowed },
          { label: 'Blocked', colour: 'viz-3', points: split.blocked },
        ]}
      />
    </View>
  );
}

function TableToggle({
  table,
  onToggle,
}: {
  readonly table: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  return (
    <Button label={table ? 'Show as chart' : 'Show as table'} variant="text" onPress={onToggle} />
  );
}

function Body({
  range,
  device,
  snapshot,
  stats,
  table,
}: {
  readonly range: Range;
  readonly device: Device;
  readonly snapshot: AdGuardSnapshot;
  readonly stats: AdGuardStats;
  readonly table: boolean;
}): ReactNode {
  if (range === 'live') {
    return <LivePlot deviceId={device.id} />;
  }
  if (stats.history.length === 0) {
    return (
      <EmptyState
        compact
        icon="activity"
        title="No lookups yet"
        body="Lookups show up here once devices start using AdGuard Home."
      />
    );
  }
  return (
    <>
      <Text variant="footnote" tone="variant">
        {periodCaption(stats)}
      </Text>
      <Plot stats={stats} at={snapshot.at} table={table} />
    </>
  );
}

export function LookupsCard({
  device,
  snapshot,
  stats,
}: {
  readonly device: Device;
  readonly snapshot: AdGuardSnapshot;
  readonly stats: AdGuardStats;
}): ReactNode {
  const [tracker] = useState(() => new LookupRateTracker());
  useSourceLive(device, snapshot, (live) => tracker.readings(live, Date.parse(live.at)));
  const [table, setTable] = useState(false);
  const [range, setRange] = useState<Range>('live');
  const hasTable = range === 'day' && stats.history.length > 0;
  return (
    <Card
      title="Lookups"
      action={
        hasTable ? (
          <TableToggle
            table={table}
            onToggle={() => {
              setTable(!table);
            }}
          />
        ) : undefined
      }
    >
      <View className={cn('gap-3', snapshot.connection.state !== 'online' && 'opacity-60')}>
        <View className="items-start">
          <Segmented label="Range" options={RANGES} value={range} onChange={setRange} />
        </View>
        <Body range={range} device={device} snapshot={snapshot} stats={stats} table={table} />
      </View>
    </Card>
  );
}
