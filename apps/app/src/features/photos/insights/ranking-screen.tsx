import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import type { Crumb } from '../../../components/breadcrumbs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListLoader } from '../../../components/list-loader';
import { List } from '../../../components/section';
import { flattenPages } from '../../drive';
import { PhotosFrame } from '../components/photos-frame';
import { usePhotoBusiestDays, usePhotoLargestVideos } from '../data';
import { BusiestDayRow, LargestRow } from './insights-lists';
import { RANKING_TITLES, rangeParamOf, rankingOf, type RankingId } from './ranking-model';

const INSIGHTS_CRUMB: Crumb = { label: 'Insights', href: href.photosPage('insights') };

interface PagedList {
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isError: boolean;
  readonly error: Error | null;
  readonly isPending: boolean;
  readonly fetchNextPage: () => Promise<unknown>;
  readonly refetch: () => Promise<unknown>;
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

function RankingBody({
  ranking,
  pages,
  rows,
}: {
  readonly ranking: RankingId;
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
  if (pages.isPending) return <ListLoader loading />;
  if (rows.length === 0) {
    return <EmptyState icon="film" title="Nothing here yet" body="Nothing matches this range." />;
  }
  return (
    <View className="gap-3">
      <List title={RANKING_TITLES[ranking]}>{rows}</List>
      <MoreRows pages={pages} />
    </View>
  );
}

function LargestVideosPaged({
  range,
}: {
  readonly range: ReturnType<typeof rangeParamOf>;
}): ReactNode {
  const pages = usePhotoLargestVideos(range);
  const rows = flattenPages(pages.data, (page) => page.items).map((video) => (
    <LargestRow key={video.itemId} video={video} />
  ));
  return <RankingBody ranking="largest-videos" pages={pages} rows={rows} />;
}

function BusiestDaysPaged({
  range,
}: {
  readonly range: ReturnType<typeof rangeParamOf>;
}): ReactNode {
  const pages = usePhotoBusiestDays(range);
  const rows = flattenPages(pages.data, (page) => page.items).map((entry) => (
    <BusiestDayRow key={entry.day} entry={entry} />
  ));
  return <RankingBody ranking="busiest-days" pages={pages} rows={rows} />;
}

export function RankingScreen(): ReactNode {
  const params = useLocalSearchParams();
  const ranking = rankingOf(params['ranking']);
  const range = rangeParamOf(params['range']);
  return (
    <PhotosFrame
      active="insights"
      title={ranking === null ? 'Insights' : RANKING_TITLES[ranking]}
      breadcrumbs={[INSIGHTS_CRUMB]}
    >
      {ranking === 'largest-videos' ? <LargestVideosPaged range={range} /> : null}
      {ranking === 'busiest-days' ? <BusiestDaysPaged range={range} /> : null}
      {ranking === null ? (
        <EmptyState icon="film" title="Unknown list" body="Open Insights to pick a list." />
      ) : null}
    </PhotosFrame>
  );
}
