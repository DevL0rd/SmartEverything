import type { PlannerSearchHit } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { href } from '../app-shell/hrefs';
import type { AppHref } from '../components/app-href';
import { Button } from '../components/button';
import { ListRow } from '../components/list-row';
import { Section, SectionAction } from '../components/section';
import { Skeleton } from '../components/skeleton';
import { Text } from '../components/text';
import { DURATION } from '../design/motion';
import { usePlannerCollections, usePlannerSearch } from '../features/planner/data';
import { usePlannerCalendars } from '../features/planner/data/sharing';
import { useHitRows } from '../features/planner/search/hit-row';
import { emptyFilter, hitsOf, searchCollectionsOf } from '../features/planner/search/search-model';
import { useSyncStatus } from '../store/selectors';
import { useRecentSearches } from './recent';
import type { RowEdge } from './result-rows';
import { RowFrame, type ResultsLook } from './row-frame';

export const PLANNER_GROUP_LABEL = 'Events and tasks';

export const PLANNER_GROUP_ROWS = 5;

const WORD = /[\p{L}\p{N}\p{M}]/u;

export type PlannerGroupState = 'hidden' | 'offline' | 'looking' | 'failed' | 'empty' | 'found';

export function plannerSearchable(query: string): boolean {
  return WORD.test(query);
}

export function plannerGroupStateOf(signals: {
  readonly searchable: boolean;
  readonly live: boolean;
  readonly answered: boolean;
  readonly failed: boolean;
  readonly found: number;
}): PlannerGroupState {
  if (!signals.searchable) return 'hidden';
  if (!signals.live) return 'offline';
  if (signals.failed) return 'failed';
  if (!signals.answered) return 'looking';
  return signals.found === 0 ? 'empty' : 'found';
}

export function plannerShownOf(hits: readonly PlannerSearchHit[]): readonly PlannerSearchHit[] {
  return hits.slice(0, PLANNER_GROUP_ROWS);
}

export function plannerFoundText(found: number, more: boolean): string {
  return more ? `${String(found)}+ found` : `${String(found)} found`;
}

export function rowEdgeOf(index: number, total: number): RowEdge {
  if (total === 1) return 'only';
  if (index === 0) return 'first';
  return index === total - 1 ? 'last' : 'middle';
}

interface PlannerResultsProps {
  readonly query: string;
  readonly look: ResultsLook;
  readonly onDone: () => void;
}

type Open = (link: AppHref) => void;

function useOpen(query: string, onDone: () => void): Open {
  const { note } = useRecentSearches();
  return (link): void => {
    note(query);
    onDone();
    router.navigate(link);
  };
}

function HitRows({
  hits,
  query,
  look,
  open,
}: {
  readonly hits: readonly PlannerSearchHit[];
  readonly query: string;
  readonly look: ResultsLook;
  readonly open: Open;
}): ReactNode {
  const collections = searchCollectionsOf(usePlannerCalendars(null), usePlannerCollections(null));
  const rows = useHitRows(hits, collections, query);
  return rows.map((row, index) => (
    <RowFrame
      key={row.key}
      look={look}
      edge={rowEdgeOf(index, rows.length)}
      depth={0}
      selected={false}
    >
      <ListRow
        {...row.props}
        onPress={() => {
          open(row.link);
        }}
      />
    </RowFrame>
  ));
}

function GroupNote(props: { readonly text: string; readonly onRetry?: () => void }): ReactNode {
  return (
    <View className="min-h-touch-min flex-row flex-wrap items-center gap-2 px-4">
      <Text variant="footnote" tone="variant" className="min-w-0 shrink">
        {props.text}
      </Text>
      {props.onRetry === undefined ? null : (
        <Button label="Try again" variant="text" onPress={props.onRetry} />
      )}
    </View>
  );
}

function Looking(): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-4 px-4">
      <Skeleton shape="block" className="size-10 rounded-sm" />
      <Skeleton shape="text" className="w-48" />
    </View>
  );
}

function usePlannerGroup(query: string): {
  readonly state: PlannerGroupState;
  readonly hits: readonly PlannerSearchHit[];
  readonly more: boolean;
  readonly retry: () => void;
} {
  const live = useSyncStatus().status === 'live';
  const searchable = plannerSearchable(query);
  const pages = usePlannerSearch(null, emptyFilter(query.trim()), searchable && live);
  const hits = hitsOf(pages.data?.pages);
  return {
    state: plannerGroupStateOf({
      searchable,
      live,
      answered: pages.data !== undefined,
      failed: pages.isError,
      found: hits.length,
    }),
    hits,
    more: pages.hasNextPage,
    retry: (): void => {
      background(pages.refetch(), 'search.planner_retry_failed');
    },
  };
}

function GroupBody({
  group,
  query,
  look,
  open,
}: {
  readonly group: ReturnType<typeof usePlannerGroup>;
  readonly query: string;
  readonly look: ResultsLook;
  readonly open: Open;
}): ReactNode {
  switch (group.state) {
    case 'offline':
      return <GroupNote text="Events and tasks show when the hub is reachable." />;
    case 'failed':
      return <GroupNote text="Events and tasks could not be searched." onRetry={group.retry} />;
    case 'looking':
      return <Looking />;
    case 'found':
      return (
        <Animated.View entering={FadeIn.duration(DURATION.short)}>
          <HitRows hits={plannerShownOf(group.hits)} query={query} look={look} open={open} />
        </Animated.View>
      );
    case 'hidden':
    case 'empty':
      return null;
  }
}

function ShowAll({ query, open }: { readonly query: string; readonly open: Open }): ReactNode {
  return (
    <SectionAction
      label="Show all"
      spoken={`Show all events and tasks for ${query.trim()}`}
      onPress={() => {
        open(href.planner.search(query.trim()));
      }}
    />
  );
}

export function PlannerResults({ query, look, onDone }: PlannerResultsProps): ReactNode {
  const group = usePlannerGroup(query);
  const open = useOpen(query, onDone);
  if (group.state === 'hidden' || group.state === 'empty') return null;
  const found = group.state === 'found';
  const more = group.hits.length > PLANNER_GROUP_ROWS || group.more;
  return (
    <View>
      <Section
        title={PLANNER_GROUP_LABEL}
        className={look === 'page' ? 'pt-section-gap pb-1' : 'pt-3 pb-1'}
        {...(found ? { caption: plannerFoundText(group.hits.length, group.more) } : {})}
        action={found && more ? <ShowAll query={query} open={open} /> : null}
      >
        {null}
      </Section>
      <GroupBody group={group} query={query} look={look} open={open} />
    </View>
  );
}
