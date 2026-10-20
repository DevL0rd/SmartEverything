import type { PrinterOverview } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc, Bars, ProgressBar } from '../../../components/charts';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { MetricStrip } from '../../../components/metric-strip';
import { Text } from '../../../components/text';
import { useDayKey } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { usePrinterView } from '../data/use-printer-view';
import { barsOf } from '../model/stats-view';

const RING = 104;

function BudgetRing({ today }: { readonly today: PrinterOverview['today'] }): ReactNode {
  const share = today.pagesWeek / Math.max(1, today.weeklyBudget);
  const over = share > 1;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${String(today.pagesWeek)} of ${String(today.weeklyBudget)} pages this week`}
      className="items-center"
    >
      <Arc
        value={Math.min(1, share)}
        size={RING}
        thickness={9}
        colour={over ? 'warning' : 'primary'}
        trackColour="track"
      />
      <View className="absolute inset-x-0 top-0 h-26 items-center justify-center">
        <Text variant="title-3" className="tabular">
          {String(today.pagesWeek)}
        </Text>
        <Text variant="caption" tone="variant">
          of {String(today.weeklyBudget)}
        </Text>
      </View>
      <Text variant="caption" tone="variant" className="pt-1">
        Pages this week
      </Text>
    </View>
  );
}

function WeekBars({ device }: { readonly device: Device }): ReactNode {
  const anchor = useDayKey();
  const stats = usePrinterView(device, 'stats', { period: 'week', anchor });
  const buckets = stats.data?.stats.buckets;
  return buckets === undefined || buckets.length === 0 ? null : (
    <View className="min-w-0 flex-1 gap-1">
      <Bars
        bars={barsOf('week', buckets)}
        colour="primary"
        height={88}
        label="Pages printed on each day this week"
      />
    </View>
  );
}

export function TodayBand({
  device,
  today,
}: {
  readonly device: Device;
  readonly today: PrinterOverview['today'];
}): ReactNode {
  const total = today.color + today.mono;
  const share = total === 0 ? null : today.color / total;
  return (
    <Card title="Today" icon="trendUp">
      <View className="gap-3">
        <View className="flex-row items-end gap-4">
          <BudgetRing today={today} />
          <WeekBars device={device} />
        </View>
        <MetricStrip
          columns={{ compact: 2, medium: 2, expanded: 2 }}
          items={[
            { key: 'today', label: 'Pages today', value: String(today.pagesToday) },
            { key: 'jobs', label: 'Jobs today', value: String(today.jobsToday) },
          ]}
        />
        {share === null ? null : (
          <View className="gap-1">
            <ProgressBar
              progress={share}
              colour="viz-magenta"
              label="Colour share of printed pages"
            />
            <Text variant="caption" tone="variant">
              Colour {String(today.color)} · Black and white {String(today.mono)}
            </Text>
          </View>
        )}
        <View className="items-end">
          <Button
            label="All print stats"
            icon="trendUp"
            variant="text"
            href={href.deviceSection(device.id, 'stats')}
          />
        </View>
      </View>
    </Card>
  );
}
