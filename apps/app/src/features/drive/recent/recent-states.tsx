import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { DriveRecentFilter } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { errorText } from '../../../format/errors';
import type { RecentPages } from './use-recent-feed';

const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'] as const;

const EMPTY: Readonly<
  Record<DriveRecentFilter, { readonly title: string; readonly body: string }>
> = {
  everything: {
    title: 'Nothing recent yet',
    body: 'Files you open, add or change show up here, newest first.',
  },
  opened: { title: 'Nothing opened yet', body: 'Files you open in Drive show up here.' },
  added: {
    title: 'Nothing added yet',
    body: 'Files added to your library folders show up here, newest first.',
  },
  changed: {
    title: 'Nothing changed yet',
    body: 'Files changed in the app, on a computer or outside SmartEverything show up here.',
  },
};

function RecentSkeleton(): ReactNode {
  return (
    <View aria-label="Loading recent files" className="gap-2 px-gutter py-2">
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

function refetch(pages: RecentPages): void {
  background(pages.refetch(), 'drive_recent.refetch_failed');
}

export type RecentState = 'loading' | 'offline' | 'error' | 'empty';

export interface RecentStateInput {
  readonly hasData: boolean;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly live: boolean;
}

export function recentStateOf(input: RecentStateInput): RecentState {
  if (!input.live && !input.hasData) return 'offline';
  if (input.isPending) return 'loading';
  return input.isError ? 'error' : 'empty';
}

export function recentStale(hasData: boolean, live: boolean): boolean {
  return hasData && !live;
}

function RecentOffline(): ReactNode {
  return (
    <EmptyState
      icon="wifiOff"
      title="The hub is offline"
      body="Recent files come back when the hub reconnects. Your files stay on the hub as they are."
    />
  );
}

export function RecentStaleBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Offline · showing the last recent files"
      body="New opens and changes appear when the hub is back."
    />
  );
}

function RecentNothing({ filter }: { readonly filter: DriveRecentFilter }): ReactNode {
  const copy = EMPTY[filter];
  return (
    <EmptyState
      icon="clock"
      title={copy.title}
      body={copy.body}
      action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
    />
  );
}

export function RecentEmpty({
  pages,
  filter,
  live,
}: {
  readonly pages: RecentPages;
  readonly filter: DriveRecentFilter;
  readonly live: boolean;
}): ReactNode {
  const state = recentStateOf({
    hasData: pages.data !== undefined,
    isPending: pages.isPending,
    isError: pages.isError,
    live,
  });
  if (state === 'offline') return <RecentOffline />;
  if (state === 'loading') return <RecentSkeleton />;
  if (state === 'empty') return <RecentNothing filter={filter} />;
  return (
    <View className="px-gutter">
      <ErrorState
        error={pages.error}
        page
        retry={() => {
          refetch(pages);
        }}
      />
    </View>
  );
}

export function RecentFooter({ pages }: { readonly pages: RecentPages }): ReactNode {
  if (pages.data === undefined) return null;
  if (pages.isFetchingNextPage) return <ActivityIndicator className="py-4" />;
  if (pages.isError) {
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
              background(pages.fetchNextPage(), 'drive_recent.retry_failed');
            },
          }}
        />
      </View>
    );
  }
  const shown = pages.data.pages.some((page) => page.entries.length > 0);
  return shown && !pages.hasNextPage ? (
    <Text variant="caption" tone="faint" align="center" className="py-4">
      That’s everything recent.
    </Text>
  ) : null;
}
