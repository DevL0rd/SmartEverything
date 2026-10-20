import type { BrushStateView, BrushingStats, StatsRange } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../../components/empty-state';
import { LoadedQuery } from '../../../components/loaded-query';
import { Segmented } from '../../../components/segmented';
import { useDayKey } from '../../../store/clock';
import type { Device } from '../../../store/state';
import { CalendarCard, RecordsCard, StreakCard } from '../components/habit-cards';
import {
  BrushesCard,
  KpiGrid,
  MixCard,
  PressureCard,
  TimeCard,
  WhenCard,
  WholeRoutineCard,
  ZoneCard,
} from '../components/stats-cards';
import { brandUi } from '../brands';
import { useBrushState, useBrushView } from '../data/brush-data';
import { RANGE_OPTIONS } from '../model/stats-model';

function Body({
  stats,
  state,
}: {
  readonly stats: BrushingStats;
  readonly state: BrushStateView;
}): ReactNode {
  if (stats.totals.sessions === 0 && stats.previous.sessions === 0 && stats.heatmap.length === 0) {
    return (
      <EmptyState
        icon="trendUp"
        title="No numbers yet"
        body="Charts and personal bests fill in after your first brushing."
      />
    );
  }
  const { StatsExtras } = brandUi(state.profile.brand);
  return (
    <View className="gap-section-gap">
      <KpiGrid stats={stats} />
      <BrushesCard stats={stats} />
      <TimeCard stats={stats} />
      <WholeRoutineCard stats={stats} />
      <WhenCard stats={stats} />
      <MixCard stats={stats} brand={state.profile.brand} />
      <ZoneCard stats={stats} profile={state.profile} />
      {state.profile.pressure === 'none' ? null : (
        <PressureCard stats={stats} brand={state.profile.brand} />
      )}
      {StatsExtras === null ? null : (
        <StatsExtras deviceId={state.deviceId} stats={stats} profile={state.profile} />
      )}
      <RecordsCard stats={stats} />
      <StreakCard stats={stats} />
      {stats.range === 'month' || stats.range === 'year' ? <CalendarCard stats={stats} /> : null}
    </View>
  );
}

function Private({ state }: { readonly state: BrushStateView }): ReactNode {
  return (
    <EmptyState
      icon="eyeOff"
      title="Numbers are private"
      body={
        state.personName === null
          ? 'Only the person this brush is set up for sees the numbers.'
          : `Sessions on this brush belong to ${state.personName}.`
      }
    />
  );
}

function Loaded({
  device,
  state,
}: {
  readonly device: Device;
  readonly state: BrushStateView;
}): ReactNode {
  const [range, setRange] = useState<StatsRange>('week');
  const today = useDayKey();
  const stats = useBrushView(device.id, 'stats', { range, anchor: today });
  return (
    <View className="gap-section-gap">
      <Segmented label="Range" options={RANGE_OPTIONS} value={range} fill onChange={setRange} />
      <LoadedQuery query={stats}>{(view) => <Body stats={view.stats} state={state} />}</LoadedQuery>
    </View>
  );
}

export function StatsSection({ device }: { readonly device: Device }): ReactNode {
  const state = useBrushState(device.id);
  return (
    <LoadedQuery query={state}>
      {(view) => (view.mine ? <Loaded device={device} state={view} /> : <Private state={view} />)}
    </LoadedQuery>
  );
}
