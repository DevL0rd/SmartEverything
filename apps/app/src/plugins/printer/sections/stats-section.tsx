import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { Segmented } from '../../../components/segmented';
import { useDayKey } from '../../../store/clock';
import type { Device } from '../../../store/state';
import type { PrinterStatsView } from '@smarteverything/domain';
import { usePrinterView } from '../data/use-printer-view';
import { PERIOD_OPTIONS, type StatsPeriod } from '../model/stats-view';
import { Bests, Events, PerJob, People, Split, StateTime, Totals, Trend } from './stats-cards';
import { Calendar, Cost, Reliability, WeekdayHours } from './stats-time';

function Body({
  view,
  period,
  today,
}: {
  readonly view: PrinterStatsView;
  readonly period: StatsPeriod;
  readonly today: string;
}): ReactNode {
  const { stats } = view;
  if (
    stats.totals.jobs === 0 &&
    stats.previous.jobs === 0 &&
    stats.heatmap.every((day) => day.pages === 0)
  ) {
    return (
      <EmptyState
        icon="printer"
        title="No numbers yet"
        body="Charts and personal bests fill in after the first print."
      />
    );
  }
  return (
    <View className="gap-section-gap">
      <Totals view={view} />
      <Trend view={view} period={period} />
      <Split view={view} />
      <PerJob view={view} />
      <People view={view} />
      <Bests view={view} />
      <Calendar view={view} today={today} />
      <WeekdayHours view={view} />
      <StateTime view={view} />
      <Reliability view={view} />
      <Cost view={view} />
      <Events view={view} />
    </View>
  );
}

export function StatsSection({ device }: { readonly device: Device }): ReactNode {
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const today = useDayKey();
  const stats = usePrinterView(device, 'stats', { period, anchor: today, compare: true });
  return (
    <View className="gap-section-gap">
      <Segmented label="Range" options={PERIOD_OPTIONS} value={period} fill onChange={setPeriod} />
      <LoadedQuery query={stats}>
        {(view) => <Body view={view} period={period} today={today} />}
      </LoadedQuery>
    </View>
  );
}
