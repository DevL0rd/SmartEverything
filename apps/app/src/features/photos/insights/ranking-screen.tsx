import type { PhotoInsightRange } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { Crumb } from '../../../components/breadcrumbs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import type { IconName } from '../../../components/icon';
import { ListLoader } from '../../../components/list-loader';
import { List } from '../../../components/section';
import { Segmented } from '../../../components/segmented';
import { Skeleton } from '../../../components/skeleton';
import { useSizeClass } from '../../../design/size-class';
import { flattenPages } from '../../drive';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoBusiestDays, usePhotoLargestVideos } from '../data';
import { BusiestDayRow, LargestRow } from './insights-lists';
import { rangeOptions } from './model';
import { RANKING_TITLES, rangeParamOf, rankingOf, type RankingId } from './ranking-model';

const INSIGHTS_CRUMB: Crumb = { label: 'Insights', href: href.photosPage('insights') };

const LOADING_ROWS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

interface EmptyCopy {
  readonly icon: IconName;
  readonly title: string;
  readonly body: string;
}

const EMPTY: Readonly<Record<RankingId, EmptyCopy>> = {
  'largest-videos': {
    icon: 'film',
    title: 'No videos in this range',
    body: 'Videos you back up show up here.',
  },
  'busiest-days': {
    icon: 'calendar',
    title: 'No photos were taken in this range',
    body: 'Photos you back up show up here.',
  },
};

interface PagedList {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly isPending: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
  readonly refetch: () => Promise<unknown>;
}

function pickRange(range: PhotoInsightRange): void {
  router.setParams({ range });
}

function MoreRows({ pages }: { readonly pages: PagedList }): ReactNode {
  if (!pages.hasNextPage) return null;
  if (pages.isFetchingNextPage) return <ListLoader loading />;
  return (
    <Button
      label="Show more"
      variant="text"
      onPress={() => {
        background(pages.fetchNextPage(), 'photos.ranking_next_page_failed');
      }}
    />
  );
}

function RowsLoading(): ReactNode {
  return (
    <View aria-busy className="gap-2">
      {LOADING_ROWS.map((row) => (
        <Skeleton key={row} shape="line" className="h-14" />
      ))}
    </View>
  );
}

function RankingEmpty({
  ranking,
  range,
}: {
  readonly ranking: RankingId;
  readonly range: PhotoInsightRange;
}): ReactNode {
  const empty = EMPTY[ranking];
  return (
    <EmptyState
      icon={empty.icon}
      title={empty.title}
      body={range === 'all_time' ? empty.body : 'A longer range may have some.'}
      {...(range === 'all_time'
        ? {}
        : {
            action: (
              <Button
                label="Show all time"
                variant="tonal"
                onPress={() => {
                  pickRange('all_time');
                }}
              />
            ),
          })}
    />
  );
}

function RankingBody({
  ranking,
  range,
  pages,
  rows,
}: {
  readonly ranking: RankingId;
  readonly range: PhotoInsightRange;
  readonly pages: PagedList;
  readonly rows: readonly ReactNode[];
}): ReactNode {
  if (pages.isError && rows.length === 0) {
    return (
      <ErrorState
        page
        error={pages.error}
        retry={() => {
          background(pages.refetch(), 'photos.ranking_retry_failed');
        }}
      />
    );
  }
  if (pages.isPending) return <RowsLoading />;
  if (rows.length === 0) return <RankingEmpty ranking={ranking} range={range} />;
  return (
    <View className="gap-3">
      <List>{rows}</List>
      <MoreRows pages={pages} />
    </View>
  );
}

function LargestVideosPaged({ range }: { readonly range: PhotoInsightRange }): ReactNode {
  const pages = usePhotoLargestVideos(range);
  const rows = flattenPages(pages.data, (page) => page.items).map((video, index) => (
    <LargestRow key={video.itemId} video={video} rank={index + 1} />
  ));
  return <RankingBody ranking="largest-videos" range={range} pages={pages} rows={rows} />;
}

function BusiestDaysPaged({ range }: { readonly range: PhotoInsightRange }): ReactNode {
  const pages = usePhotoBusiestDays(range);
  const rows = flattenPages(pages.data, (page) => page.items).map((entry) => (
    <BusiestDayRow key={entry.day} entry={entry} range={range} />
  ));
  return <RankingBody ranking="busiest-days" range={range} pages={pages} rows={rows} />;
}

function Unknown(): ReactNode {
  return (
    <EmptyState
      icon="trendUp"
      title="Unknown list"
      body="Open Insights to pick a list."
      action={<Button label="Open Insights" variant="tonal" href={href.photosPage('insights')} />}
    />
  );
}

export function RankingScreen(): ReactNode {
  const params = useLocalSearchParams();
  const ranking = rankingOf(params['ranking']);
  const range = rangeParamOf(params['range']);
  const compact = useSizeClass().width === 'compact';
  return (
    <PhotosFrame
      active="insights"
      title={ranking === null ? 'Insights' : RANKING_TITLES[ranking]}
      breadcrumbs={[INSIGHTS_CRUMB]}
    >
      {ranking === null ? (
        <Unknown />
      ) : (
        <View className="gap-section-gap">
          <Segmented
            options={rangeOptions(compact)}
            value={range}
            onChange={pickRange}
            label="Range"
            fill={compact}
          />
          {ranking === 'largest-videos' ? <LargestVideosPaged range={range} /> : null}
          {ranking === 'busiest-days' ? <BusiestDaysPaged range={range} /> : null}
        </View>
      )}
    </PhotosFrame>
  );
}
