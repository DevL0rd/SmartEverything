import { useEffect, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { VacuumCleanSummary, VacuumScene } from '@smarteverything/domain';
import { Badge } from '../../../../components/badge';
import { Button } from '../../../../components/button';
import { Card } from '../../../../components/card';
import { EmptyState } from '../../../../components/empty-state';
import { ErrorState } from '../../../../components/error-state';
import { IconButton } from '../../../../components/icon-button';
import { Interactive } from '../../../../components/interactive';
import { Segmented } from '../../../../components/segmented';
import { Skeleton } from '../../../../components/skeleton';
import { Text } from '../../../../components/text';
import { duration, moment } from '../../../../format/time';
import { useMinute } from '../../../../store/clock';
import type { Device } from '../../../../store/state';
import { CleanReplay, cleanScopeText, outcomeLook } from '../components/clean-replay';
import { needsOlderCleans } from '../data/cleans-paging';
import { useVacuumCleans, type VacuumCleansPages } from '../data/cleans-query';
import { parseMapVersion } from '../data/map-feed';
import { useVacuumScene } from '../data/scene-query';
import { useVacuum } from '../data/use-vacuum';
import { readingOf, valueOrNull } from '../model/readings';
import {
  canStepForward,
  periodAt,
  shiftPeriod,
  type StatsPeriod,
  type StatsRange,
} from '../model/stats-period';
import { lifetimeOf, statsOf } from '../model/stats-series';
import { Battery, Charts } from './history-charts';
import { Lifetime, Tiles, cleansIn } from './history-stats';

const RANGES = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
] as const;
const FIRST_SHOWN = 5;
const SHOWN_STEP = 10;
function useCurrentScene(device: Device): VacuumScene | null {
  const { snapshot } = useVacuum(device);
  const version = valueOrNull(readingOf(() => parseMapVersion(snapshot.mapVersionText)));
  return useVacuumScene(device.id, version).scene;
}

function RangeBar({
  period,
  now,
  onRange,
  onShift,
}: {
  readonly period: StatsPeriod;
  readonly now: number;
  readonly onRange: (range: StatsRange) => void;
  readonly onShift: (by: number) => void;
}): ReactNode {
  return (
    <Card>
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Segmented label="Range" options={RANGES} value={period.range} onChange={onRange} />
        <View className="flex-row items-center">
          <IconButton
            icon="chevronLeft"
            label="Previous period"
            onPress={() => {
              onShift(-1);
            }}
          />
          <Text variant="body-strong" className="min-w-28 text-center tabular">
            {period.label}
          </Text>
          <IconButton
            icon="chevronRight"
            label="Next period"
            disabled={!canStepForward(period, now)}
            onPress={() => {
              onShift(1);
            }}
          />
        </View>
      </View>
    </Card>
  );
}
function CleanRow({
  clean,
  selected,
  now,
  onPress,
}: {
  readonly clean: VacuumCleanSummary;
  readonly selected: boolean;
  readonly now: number;
  readonly onPress: () => void;
}): ReactNode {
  const look = outcomeLook(clean.outcome);
  const detail = `${moment(clean.startedAt, now)} · ${String(Math.round(clean.areaM2))} m² · ${duration(clean.seconds)}`;
  return (
    <Interactive
      label={`${cleanScopeText(clean)}, ${detail}, ${look.label}. Replay the path`}
      selected={selected}
      onPress={onPress}
      className="min-h-touch-min flex-row items-center gap-3 py-2"
    >
      <View className="min-w-0 flex-1">
        <Text variant="body-strong" numberOfLines={1}>
          {cleanScopeText(clean)}
        </Text>
        <Text variant="footnote" tone="variant" className="tabular" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Badge label={look.label} tone={look.tone} />
    </Interactive>
  );
}

function CleansList({
  pages,
  cleans,
  selectedId,
  onSelect,
}: {
  readonly pages: VacuumCleansPages;
  readonly cleans: readonly VacuumCleanSummary[];
  readonly selectedId: string | null;
  readonly onSelect: (clean: VacuumCleanSummary) => void;
}): ReactNode {
  const now = useMinute();
  const [shown, setShown] = useState(FIRST_SHOWN);
  return (
    <Card title="Cleans">
      {cleans.slice(0, shown).map((clean) => (
        <CleanRow
          key={clean.id}
          clean={clean}
          now={now}
          selected={clean.id === selectedId}
          onPress={() => {
            onSelect(clean);
          }}
        />
      ))}
      {cleans.length > shown ? (
        <Button
          label="Show more"
          variant="tonal"
          onPress={() => {
            setShown(shown + SHOWN_STEP);
          }}
        />
      ) : null}
      {pages.more && cleans.length <= shown ? (
        <Button
          label="Load older cleans"
          variant="tonal"
          loading={pages.loadingMore}
          onPress={pages.loadMore}
        />
      ) : null}
    </Card>
  );
}

function useOlderCleans(pages: VacuumCleansPages, period: StatsPeriod): void {
  const { cleans, more, loadingMore, failure, loadMore } = pages;
  useEffect(() => {
    if (failure === null && !loadingMore && needsOlderCleans(cleans, period.startMs, more)) {
      loadMore();
    }
  }, [cleans, more, loadingMore, failure, loadMore, period.startMs]);
}

function Loading(): ReactNode {
  return (
    <View className="gap-3">
      <Skeleton shape="block" className="h-24" />
      <Skeleton shape="block" className="h-40" />
    </View>
  );
}

function Replayed({
  device,
  replayed,
  onClose,
}: {
  readonly device: Device;
  readonly replayed: VacuumCleanSummary | null;
  readonly onClose: () => void;
}): ReactNode {
  const scene = useCurrentScene(device);
  return replayed === null ? null : (
    <CleanReplay device={device} clean={replayed} scene={scene} onClose={onClose} />
  );
}

function HistoryBody({
  device,
  pages,
  period,
  now,
}: {
  readonly device: Device;
  readonly pages: VacuumCleansPages;
  readonly period: StatsPeriod;
  readonly now: number;
}): ReactNode {
  const [replayed, setReplayed] = useState<VacuumCleanSummary | null>(null);
  const inPeriod = cleansIn(pages.cleans, period);
  const stats = statsOf(inPeriod, period);
  return (
    <>
      <Tiles stats={stats} />
      <Lifetime device={device} />
      {stats.empty ? (
        <EmptyState
          compact
          icon="activity"
          title="No cleans in this period"
          body="Try another period."
        />
      ) : (
        <Charts stats={stats} period={period} cleans={inPeriod} />
      )}
      <Battery device={device} period={period} now={now} cleans={inPeriod} />
      <Replayed
        device={device}
        replayed={replayed}
        onClose={() => {
          setReplayed(null);
        }}
      />
      <CleansList
        pages={pages}
        cleans={inPeriod}
        selectedId={replayed?.id ?? null}
        onSelect={setReplayed}
      />
    </>
  );
}

function Body({
  device,
  pages,
  period,
  now,
}: {
  readonly device: Device;
  readonly pages: VacuumCleansPages;
  readonly period: StatsPeriod;
  readonly now: number;
}): ReactNode {
  if (pages.failure !== null) {
    return <ErrorState error={pages.failure} retry={pages.retry} />;
  }
  if (pages.loading) {
    return <Loading />;
  }
  if (pages.cleans.length === 0) {
    return (
      <EmptyState
        icon="activity"
        title="No cleans yet"
        body="They appear here after the first run."
      />
    );
  }
  return <HistoryBody device={device} pages={pages} period={period} now={now} />;
}

export function VacuumHistory({ device }: { readonly device: Device }): ReactNode {
  const now = useMinute();
  const { snapshot } = useVacuum(device);
  const pages = useVacuumCleans(device.id, lifetimeOf(snapshot.values).cleans);
  const [period, setPeriod] = useState(() => periodAt('month', now));
  useOlderCleans(pages, period);
  return (
    <View className="gap-section-gap">
      <RangeBar
        period={period}
        now={now}
        onRange={(range) => {
          setPeriod(periodAt(range, now));
        }}
        onShift={(by) => {
          setPeriod(shiftPeriod(period, by));
        }}
      />
      <Body device={device} pages={pages} period={period} now={now} />
    </View>
  );
}
