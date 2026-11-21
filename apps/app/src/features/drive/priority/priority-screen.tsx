import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Grid } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { useMinute } from '../../../store/clock';
import { useSettings, useSyncStatus } from '../../../store/selectors';
import {
  flattenPages,
  useDriveAccessRequestRows,
  useDriveNotificationRows,
  useDriveSuggested,
  useDriveTransferRows,
  useViewerId,
} from '../data';
import { DriveFrame } from '../components/drive-frame';
import { useByName } from '../components/use-by-name';
import {
  PRIORITY_EMPTY_BODY,
  PRIORITY_EMPTY_TITLE,
  prioritySubtitleOf,
  suggestionGroupsOf,
  waitingTilesOf,
  type SuggestionGroup,
  type WaitingTile,
} from './priority-model';
import { SectionHead } from '../starred/section-head';
import { SuggestionCard, suggestionKeyOf } from './suggestion-card';

const CARD_MIN_WIDTH = 300;

const PLACEHOLDERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

function WaitingCard({ tile }: { readonly tile: WaitingTile }): ReactNode {
  return (
    <Interactive
      href={href.drivePage('notifications')}
      label={`${String(tile.count)} ${tile.label.toLowerCase()}, open Notifications`}
      className="min-h-16 flex-row items-center gap-3 rounded-md border-hairline border-outline-variant bg-surface-1 px-3 py-2"
      layerClassName="rounded-md"
    >
      <View className="size-10 items-center justify-center rounded-full bg-primary-container">
        <Icon name={tile.icon} size={20} tone="primary" />
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="title-3" className="tabular">
          {count(tile.count)}
        </Text>
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {tile.label}
        </Text>
      </View>
      <Icon name="chevronRight" size={20} tone="faint" />
    </Interactive>
  );
}

function Waiting({ tiles }: { readonly tiles: readonly WaitingTile[] }): ReactNode {
  if (tiles.length === 0) return null;
  return (
    <View className="gap-2">
      <SectionHead title="Waiting for you" />
      <Grid minItemWidth={240} maxColumns={tiles.length} stretchLastRow={false}>
        {tiles.map((tile) => (
          <WaitingCard key={tile.kind} tile={tile} />
        ))}
      </Grid>
    </View>
  );
}

function Group({ group }: { readonly group: SuggestionGroup }): ReactNode {
  const nameOf = useByName();
  return (
    <View className="gap-2">
      <SectionHead title={group.label} />
      <Grid minItemWidth={CARD_MIN_WIDTH} maxColumns={3} stretchLastRow={false}>
        {group.suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestionKeyOf(suggestion)}
            suggestion={suggestion}
            nameOf={nameOf}
            fill
          />
        ))}
      </Grid>
    </View>
  );
}

function Loading(): ReactNode {
  return (
    <View aria-busy aria-label="Loading suggestions" className="gap-2">
      <Skeleton shape="text" className="mx-1 h-4 w-24" />
      <Grid minItemWidth={CARD_MIN_WIDTH} maxColumns={3} stretchLastRow={false}>
        {PLACEHOLDERS.map((key) => (
          <View
            key={key}
            className="min-w-0 flex-1 flex-row items-center gap-3 rounded-md border-hairline border-outline-variant bg-surface-1 p-2"
          >
            <Skeleton className="h-12 w-16 rounded-sm" />
            <View className="min-w-0 flex-1 gap-2">
              <Skeleton shape="text" className="w-3/5" />
              <Skeleton shape="text" className="w-4/5" />
            </View>
          </View>
        ))}
      </Grid>
    </View>
  );
}

function Unloaded({
  query,
  live,
}: {
  readonly query: ReturnType<typeof useDriveSuggested>;
  readonly live: boolean;
}): ReactNode {
  if (!live) {
    return (
      <EmptyState
        icon="wifiOff"
        title="The hub is offline"
        body="Suggestions come back when the hub reconnects. Your files stay on the hub as they are."
      />
    );
  }
  if (!query.isError) return <Loading />;
  return (
    <ErrorState
      error={query.error}
      page
      retry={() => {
        background(query.refetch(), 'drive.priority_refetch_failed');
      }}
    />
  );
}

function Suggestions({
  query,
  groups,
  live,
}: {
  readonly query: ReturnType<typeof useDriveSuggested>;
  readonly groups: readonly SuggestionGroup[];
  readonly live: boolean;
}): ReactNode {
  if (query.data === undefined) return <Unloaded query={query} live={live} />;
  if (groups.length === 0) {
    return (
      <EmptyState
        icon="sparkles"
        title={PRIORITY_EMPTY_TITLE}
        body={PRIORITY_EMPTY_BODY}
        action={<Button label="Open My Drive" variant="tonal" href={href.drive()} />}
      />
    );
  }
  return (
    <>
      {groups.map((group) => (
        <Group key={group.band} group={group} />
      ))}
      {query.hasNextPage ? (
        <View className="flex-row justify-center">
          <Button
            label="Show more"
            variant="tonal"
            loading={query.isFetchingNextPage}
            onPress={() => {
              background(query.fetchNextPage(), 'drive.priority_next_page_failed');
            }}
          />
        </View>
      ) : null}
    </>
  );
}

export function PriorityScreen(): ReactNode {
  const query = useDriveSuggested();
  const now = useMinute();
  const timeZone = useSettings().time_zone;
  const live = useSyncStatus().status === 'live';
  const driveAccessRequestRows = useDriveAccessRequestRows();
  const driveTransferRows = useDriveTransferRows();
  const driveNotificationRows = useDriveNotificationRows();
  const viewerId = useViewerId();
  const suggestions = flattenPages(query.data, (page) => page.items);
  const groups = suggestionGroupsOf(suggestions, now, timeZone);
  const tiles = waitingTilesOf({
    viewerId,
    requests: driveAccessRequestRows,
    transfers: driveTransferRows,
    notifications: driveNotificationRows,
  });
  const shown = groups.reduce((sum, group) => sum + group.suggestions.length, 0);
  const subtitle = prioritySubtitleOf(
    query.data === undefined ? null : shown,
    query.hasNextPage,
    tiles,
  );
  return (
    <DriveFrame
      section="priority"
      title="Priority"
      {...(subtitle === undefined ? {} : { subtitle })}
    >
      <View className="gap-6">
        <Waiting tiles={tiles} />
        <Suggestions query={query} groups={groups} live={live} />
      </View>
    </DriveFrame>
  );
}
