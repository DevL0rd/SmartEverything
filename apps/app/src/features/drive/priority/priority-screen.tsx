import type { ReactNode } from 'react';
import { View } from 'react-native';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Grid } from '../../../components/grid';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Section } from '../../../components/section';
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
import { SuggestionCard, suggestionKeyOf } from './suggestion-card';

export const PRIORITY_OFFLINE_TITLE = 'Showing the last known suggestions · reconnecting';

const CARD_MIN_WIDTH = 300;

const PLACEHOLDERS = ['a', 'b', 'c', 'd'] as const;

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
    <Section title="Waiting for you">
      <Grid minItemWidth={240} maxColumns={tiles.length}>
        {tiles.map((tile) => (
          <WaitingCard key={tile.kind} tile={tile} />
        ))}
      </Grid>
    </Section>
  );
}

function Group({ group }: { readonly group: SuggestionGroup }): ReactNode {
  const nameOf = useByName();
  return (
    <Section title={group.label}>
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
    </Section>
  );
}

function Loading(): ReactNode {
  return (
    <View aria-busy className="gap-3">
      {PLACEHOLDERS.map((key) => (
        <Skeleton key={key} shape="tile" className="h-16" />
      ))}
    </View>
  );
}

function Suggestions({
  query,
  groups,
}: {
  readonly query: ReturnType<typeof useDriveSuggested>;
  readonly groups: readonly SuggestionGroup[];
}): ReactNode {
  if (query.data === undefined) {
    if (!query.isError) return <Loading />;
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), 'drive.priority_refetch_failed');
        }}
      />
    );
  }
  if (groups.length === 0) {
    return <EmptyState icon="sparkles" title={PRIORITY_EMPTY_TITLE} body={PRIORITY_EMPTY_BODY} />;
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
  const suggestions = flattenPages(query.data, (page) => page.items);
  const groups = suggestionGroupsOf(suggestions, now, timeZone);
  const tiles = waitingTilesOf({
    viewerId: useViewerId(),
    requests: useDriveAccessRequestRows(),
    transfers: useDriveTransferRows(),
    notifications: useDriveNotificationRows(),
  });
  const shown = groups.reduce((sum, group) => sum + group.suggestions.length, 0);
  return (
    <DriveFrame
      section="priority"
      title="Priority"
      subtitle={prioritySubtitleOf(shown, query.hasNextPage, tiles)}
      {...(live ? {} : { banner: <Banner tone="info" title={PRIORITY_OFFLINE_TITLE} /> })}
    >
      <View className="gap-6">
        <Waiting tiles={tiles} />
        <Suggestions query={query} groups={groups} />
      </View>
    </DriveFrame>
  );
}
