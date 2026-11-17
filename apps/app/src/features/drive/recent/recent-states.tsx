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
import { DRIVE_FILTER_LOOK, type DriveFilter } from '../model/drive-chip';
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
    body: 'Files added to your drives show up here, newest first.',
  },
  changed: {
    title: 'Nothing changed yet',
    body: 'Files changed in the app, on a computer or outside SmartEverything show up here.',
  },
};

export function DriveRowsSkeleton({ label }: { readonly label: string }): ReactNode {
  return (
    <View aria-busy aria-label={label}>
      {SKELETON_ROWS.map((key) => (
        <View
          key={key}
          className="min-h-14 flex-row items-center gap-3 border-t border-outline-variant pl-4 pr-1"
        >
          <Skeleton className="size-8 rounded-sm" />
          <View className="min-w-0 flex-1 gap-2">
            <Skeleton shape="text" className="w-2/5" />
            <Skeleton shape="text" className="w-3/4" />
          </View>
          <View className="items-end gap-2">
            <Skeleton shape="text" className="w-10" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </View>
          <View className="w-touch-min" />
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

function RecentOffline(): ReactNode {
  return (
    <EmptyState
      icon="wifiOff"
      title="The hub is offline"
      body="Recent files come back when the hub reconnects. Your files stay on the hub as they are."
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

function RecentNotInDrive({
  drive,
  onAllDrives,
}: {
  readonly drive: DriveFilter;
  readonly onAllDrives: () => void;
}): ReactNode {
  return (
    <EmptyState
      icon="clock"
      title={`Nothing recent in ${DRIVE_FILTER_LOOK[drive].label}`}
      body="Other drives have recent files. Show all drives to see them."
      action={<Button label="Show all drives" variant="tonal" onPress={onAllDrives} />}
    />
  );
}

export function RecentEmpty({
  pages,
  filter,
  drive,
  onAllDrives,
  live,
}: {
  readonly pages: RecentPages;
  readonly filter: DriveRecentFilter;
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
  if (state === 'offline') return <RecentOffline />;
  if (state === 'loading') return <DriveRowsSkeleton label="Loading recent files" />;
  if (state === 'empty' && drive !== 'all') {
    return <RecentNotInDrive drive={drive} onAllDrives={onAllDrives} />;
  }
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
    <Text variant="caption" tone="variant" align="center" className="py-4">
      That’s everything recent.
    </Text>
  ) : null;
}
