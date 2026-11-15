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
  BusiestDays,
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

const STAT_COLUMNS = { compact: 2, medium: 3, expanded: 3 } as const;

const ROW = 'gap-4 large:flex-row';

const TOP_ROW = 'gap-4 large:flex-row large:items-start';

const HALF = 'min-w-0 large:flex-1';

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
  const ranked = insights.busiestDays.length > 0 || insights.largestVideos.length > 0;
  return (
    <>
      <View className={ROW}>
        <GrowthCard growth={growth} className={HALF} />
        <KindsCard insights={insights} className="min-w-0 large:w-80" />
      </View>
      <CalendarCard insights={insights} range={range} today={today} compact={compact} />
      {ranked ? (
        <View className={ROW}>
          <BusiestDays
            days={insights.busiestDays}
            range={range}
            compact={compact}
            className={HALF}
          />
          <LargestVideos
            videos={insights.largestVideos}
            range={range}
            compact={compact}
            className={HALF}
          />
        </View>
      ) : null}
      <View className={TOP_ROW}>
        <WeekCard insights={insights} className={HALF} />
        <SeasonCard insights={insights} className={HALF} />
      </View>
      <View className={TOP_ROW}>
        <PlacesCard places={insights.places} className={HALF} />
        <CamerasCard insights={insights} className={HALF} />
      </View>
      {insights.backupCoverage.length > 0 || owner ? (
        <View className={ROW}>
          <CoverageCard coverage={insights.backupCoverage} className={HALF} />
          {owner ? <FoldersCard roots={insights.roots} compact={compact} className={HALF} /> : null}
        </View>
      ) : null}
    </>
  );
}

function LoadedInsights({
  onRange,
  ...shown
}: Shown & { readonly onRange: (range: PhotoInsightRange) => void }): ReactNode {
  const counts = usePhotoRailCounts().data;
  const phase = phaseOf(shown.insights, counts?.library);
  if (phase === 'empty') return <InsightsEmpty />;
  if (phase === 'range-empty') {
    return (
      <RangeEmpty
        onAllTime={() => {
          onRange('all_time');
        }}
      />
    );
  }
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
  readonly onRange: (range: PhotoInsightRange) => void;
  readonly compact: boolean;
  readonly live: boolean;
  readonly query: ReturnType<typeof usePhotoInsights>;
}

function InsightsBody({ range, onRange, compact, live, query }: BodyProps): ReactNode {
  const owner = useIsOwner();
  const today = useDayKey();
  const insights = query.data;
  if (insights !== undefined) {
    return (
      <LoadedInsights
        insights={insights}
        range={range}
        onRange={onRange}
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
  const library = usePhotoRailCounts().data?.library;
  const stale = query.data !== undefined && (query.isError || !live);
  const empty =
    query.data !== undefined && library !== undefined && phaseOf(query.data, library) === 'empty';
  return (
    <PhotosFrame
      active="insights"
      subtitle="What you take, where and when"
      banner={stale ? <StaleBanner /> : null}
    >
      <View className="gap-section-gap">
        {empty ? null : (
          <Segmented
            options={rangeOptions(compact)}
            value={range}
            onChange={setRange}
            label="Range"
            fill={compact}
          />
        )}
        <InsightsBody
          range={range}
          onRange={setRange}
          compact={compact}
          live={live}
          query={query}
        />
      </View>
    </PhotosFrame>
  );
}
