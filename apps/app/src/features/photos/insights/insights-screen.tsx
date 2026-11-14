import type { PhotoInsightRange, PhotoInsights } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { MetricStrip } from '../../../components/metric-strip';
import { Segmented } from '../../../components/segmented';
import { useSizeClass } from '../../../design/size-class';
import { useDayKey } from '../../../store/clock';
import { useIsOwner, useSyncStatus } from '../../../store/selectors';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoInsights, usePhotoRailCounts } from '../data';
import { CalendarCard, GrowthCard, KindsCard, SeasonCard, WeekCard } from './insights-charts';
import {
  CamerasCard,
  CoverageCard,
  FoldersCard,
  LargestVideos,
  PlacesCard,
} from './insights-lists';
import {
  InsightsEmpty,
  InsightsError,
  InsightsOffline,
  InsightsSkeleton,
  RangeEmpty,
  StaleBanner,
  YoungCard,
} from './insights-states';
import { phaseOf, rangeOptions, statItems } from './model';

const STAT_COLUMNS = { compact: 2, medium: 3, expanded: 6 } as const;

interface Shown {
  readonly insights: PhotoInsights;
  readonly range: PhotoInsightRange;
  readonly today: string;
  readonly compact: boolean;
  readonly owner: boolean;
}

function FullInsights({
  insights,
  growth,
  range,
  today,
  compact,
  owner,
}: Shown & { readonly growth: NonNullable<PhotoInsights['growth']> }): ReactNode {
  return (
    <>
      <View className="gap-4 large:flex-row large:items-start">
        <View className="min-w-0 large:flex-1">
          <GrowthCard growth={growth} />
        </View>
        <View className="min-w-0 large:w-80">
          <KindsCard insights={insights} />
        </View>
      </View>
      <CalendarCard insights={insights} range={range} today={today} compact={compact} />
      <View className="gap-4 large:flex-row large:items-start">
        <View className="min-w-0 large:flex-1">
          <WeekCard insights={insights} />
        </View>
        <View className="min-w-0 large:flex-1">
          <SeasonCard insights={insights} />
        </View>
      </View>
      <View className="gap-4 large:flex-row large:items-start">
        <View className="min-w-0 large:flex-1">
          <PlacesCard places={insights.places} />
        </View>
        <View className="min-w-0 large:flex-1">
          <CamerasCard insights={insights} />
        </View>
        <View className="min-w-0 gap-4 large:flex-1">
          <CoverageCard coverage={insights.backupCoverage} />
          <LargestVideos videos={insights.largestVideos} />
        </View>
      </View>
      {owner ? <FoldersCard roots={insights.roots} /> : null}
    </>
  );
}

function LoadedInsights(shown: Shown): ReactNode {
  const counts = usePhotoRailCounts().data;
  const phase = phaseOf(shown.insights, counts?.library);
  if (phase === 'empty') return <InsightsEmpty />;
  if (phase === 'range-empty') return <RangeEmpty />;
  const { growth } = shown.insights;
  return (
    <>
      <MetricStrip items={statItems(shown.insights, counts)} columns={STAT_COLUMNS} />
      {growth === null ? (
        <YoungCard insights={shown.insights} today={shown.today} />
      ) : (
        <FullInsights {...shown} growth={growth} />
      )}
    </>
  );
}

interface BodyProps {
  readonly range: PhotoInsightRange;
  readonly compact: boolean;
  readonly live: boolean;
  readonly query: ReturnType<typeof usePhotoInsights>;
}

function InsightsBody({ range, compact, live, query }: BodyProps): ReactNode {
  const owner = useIsOwner();
  const today = useDayKey();
  const insights = query.data;
  if (insights !== undefined) {
    return (
      <LoadedInsights
        insights={insights}
        range={range}
        today={today}
        compact={compact}
        owner={owner}
      />
    );
  }
  if (query.isError) {
    return live ? (
      <InsightsError
        error={query.error}
        retry={() => {
          background(query.refetch(), 'photos.insights_refetch_failed');
        }}
      />
    ) : (
      <InsightsOffline />
    );
  }
  return <InsightsSkeleton />;
}

export function InsightsScreen(): ReactNode {
  const [range, setRange] = useState<PhotoInsightRange>('this_year');
  const compact = useSizeClass().width === 'compact';
  const live = useSyncStatus().status === 'live';
  const query = usePhotoInsights(range);
  const stale = query.data !== undefined && (query.isError || !live);
  return (
    <PhotosFrame
      active="insights"
      subtitle="What you take, where and when"
      banner={stale ? <StaleBanner /> : null}
    >
      <View className="gap-section-gap">
        <Segmented
          options={rangeOptions(compact)}
          value={range}
          onChange={setRange}
          label="Range"
          fill={compact}
        />
        <InsightsBody range={range} compact={compact} live={live} query={query} />
      </View>
    </PhotosFrame>
  );
}
