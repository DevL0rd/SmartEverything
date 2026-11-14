import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { DriveQueryPage } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { errorText } from '../../../format/errors';
import type { DrivePages } from '../data';
import { DRIVE_FILTER_LOOK, type DriveFilter } from '../model/drive-chip';
import { recentStateOf } from '../recent/recent-states';
import { nothingStarredBody, type StarredChip } from './starred-model';

export type StarredPages = DrivePages<DriveQueryPage>;

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'] as const;

function StarredSkeleton(): ReactNode {
  return (
    <View aria-label="Loading starred files" className="gap-2 px-gutter py-2">
      {SKELETON_ROWS.map((key) => (
        <View key={key} className="min-h-row-h-2 flex-row items-center gap-4">
          <Skeleton shape="circle" className="size-8 rounded-sm" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" className="w-48" />
            <Skeleton shape="text" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function StarredStaleBanner(): ReactNode {
  return (
    <Banner
      wrapBody
      tone="info"
      title="Offline · showing the last starred files"
      body="Stars and smart folders change again when the hub is back."
    />
  );
}

function StarredOffline(): ReactNode {
  return (
    <EmptyState
      icon="wifiOff"
      title="The hub is offline"
      body="Starred files come back when the hub reconnects. Your files stay on the hub as they are."
    />
  );
}

function NothingStarred({ chip }: { readonly chip: StarredChip }): ReactNode {
  return (
    <EmptyState
      icon="star"
      title="Nothing starred"
      body={nothingStarredBody(chip)}
      action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
    />
  );
}

function NotInDrive({
  drive,
  onAllDrives,
}: {
  readonly drive: DriveFilter;
  readonly onAllDrives: () => void;
}): ReactNode {
  return (
    <EmptyState
      icon="star"
      title={`Nothing starred in ${DRIVE_FILTER_LOOK[drive].label}`}
      body="Your other drives have starred files. Show all drives to see them."
      action={<Button label="Show all drives" variant="tonal" onPress={onAllDrives} />}
    />
  );
}

export function StarredEmpty({
  pages,
  chip,
  drive,
  onAllDrives,
  live,
}: {
  readonly pages: StarredPages;
  readonly chip: StarredChip;
  readonly drive: DriveFilter;
  readonly onAllDrives: () => void;
  readonly live: boolean;
}): ReactNode {
  const state = recentStateOf({
    hasData: pages.data !== undefined,
    isPending: pages.isPending,
    isError: pages.isError,
    live,
  });
  if (state === 'offline') return <StarredOffline />;
  if (state === 'loading') return <StarredSkeleton />;
  if (state === 'empty' && drive !== 'all') {
    return <NotInDrive drive={drive} onAllDrives={onAllDrives} />;
  }
  if (state === 'empty') return <NothingStarred chip={chip} />;
  return (
    <View className="px-gutter">
      <ErrorState
        error={pages.error}
        page
        retry={() => {
          background(pages.refetch(), 'drive_starred.refetch_failed');
        }}
      />
    </View>
  );
}

export function StarredFooter({ pages }: { readonly pages: StarredPages }): ReactNode {
  if (pages.data === undefined) return null;
  if (pages.isFetchingNextPage) return <ActivityIndicator className="py-4" />;
  if (!pages.isError) return null;
  return (
    <View className="px-gutter pb-3">
      <Banner
        tone="critical"
        title="Couldn’t load more"
        body={errorText(pages.error).title}
        wrapBody
        action={{
          label: 'Try again',
          onPress: () => {
            background(pages.fetchNextPage(), 'drive_starred.retry_failed');
          },
        }}
      />
    </View>
  );
}

export function loadMoreStarred(pages: StarredPages): void {
  if (pages.hasNextPage && !pages.isFetchingNextPage && !pages.isError) {
    background(pages.fetchNextPage(), 'drive_starred.next_page_failed');
  }
}
