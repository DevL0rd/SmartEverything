import { background } from '@smarteverything/logging';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import type { MenuItem } from '../../../components/menu';
import { PageShell } from '../../../components/page-shell/page-shell';
import { List } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { useDebouncedValue } from '../../../design/use-debounced-value';
import { useSyncStatus } from '../../../store/selectors';
import { usePlannerCollections, usePlannerSearch } from '../data';
import { usePlannerCalendars } from '../data/sharing';
import type { PlannerSearchFilter, PlannerSearchPages } from '../data/search';
import { usePlannerShownPerson } from '../frame/person';
import { useHitRows } from './hit-row';
import { SearchFilters } from './search-filters';
import {
  emptyFilter,
  filtered,
  foundTextOf,
  groupHits,
  hitsOf,
  searchCollectionsOf,
  type HitGroup,
} from './search-model';
import type { PlannerCollectionRow } from '@smarteverything/domain';

const SETTLE_MS = 200;
const LOOKING_ROWS = 5;

const OVERFLOW: readonly MenuItem[] = [
  {
    id: 'ask-ai',
    label: 'Ask AI',
    icon: 'sparkles',
    onPress: (): void => {
      router.push(href.assistantChat());
    },
  },
];

function GroupList({
  group,
  collections,
  query,
}: {
  readonly group: HitGroup;
  readonly collections: readonly PlannerCollectionRow[];
  readonly query: string;
}): ReactNode {
  const rows = useHitRows(group.hits, collections, query);
  return (
    <List title={group.title} caption={String(group.hits.length)}>
      {rows.map((row) => (
        <ListRow key={row.key} {...row.props} href={row.link} chevron wrapTitle />
      ))}
    </List>
  );
}

function LookingRow(): ReactNode {
  return (
    <View className="min-h-touch-min flex-row items-center gap-3 px-4 py-3">
      <Skeleton shape="circle" className="size-11 rounded-sm" />
      <View className="min-w-0 flex-1 gap-2">
        <Skeleton className="w-1/2" />
        <Skeleton shape="text" />
      </View>
    </View>
  );
}

function Looking(): ReactNode {
  return (
    <View className="gap-2">
      <Skeleton shape="text" className="w-20" />
      <View className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 elevation-1">
        {Array.from({ length: LOOKING_ROWS }, (_, index) => (
          <View key={index}>
            {index === 0 ? null : <View className="h-hairline bg-outline-variant" />}
            <LookingRow />
          </View>
        ))}
      </View>
    </View>
  );
}

interface ResultsProps {
  readonly pages: PlannerSearchPages;
  readonly filter: PlannerSearchFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly onClear: () => void;
}

function NoMatches({ filter, onClear }: Pick<ResultsProps, 'filter' | 'onClear'>): ReactNode {
  return (
    <EmptyState
      icon="search"
      title={`No matches for “${filter.text}”`}
      body={
        filtered(filter)
          ? 'Nothing matches with these filters. Clear them to search everything.'
          : 'Try another word from the title, notes, place, guests or calendar.'
      }
      {...(filtered(filter)
        ? { action: <Button label="Clear filters" variant="tonal" onPress={onClear} /> }
        : {})}
    />
  );
}

function Results({ pages, filter, collections, onClear }: ResultsProps): ReactNode {
  const hits = hitsOf(pages.data?.pages);
  if (pages.isError && pages.data === undefined) {
    return (
      <ErrorState
        error={pages.error}
        retry={() => {
          background(pages.refetch(), 'planner.search_retry_failed');
        }}
        page
      />
    );
  }
  if (pages.data === undefined) return <Looking />;
  if (hits.length === 0) return <NoMatches filter={filter} onClear={onClear} />;
  return (
    <View className="gap-section-gap">
      {groupHits(hits).map((group) => (
        <GroupList key={group.key} group={group} collections={collections} query={filter.text} />
      ))}
      {pages.hasNextPage ? (
        <View className="flex-row justify-center">
          <Button
            label="Show more"
            variant="tonal"
            loading={pages.isFetchingNextPage}
            onPress={() => {
              background(pages.fetchNextPage(), 'planner.search_more_failed');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function Start(): ReactNode {
  return (
    <EmptyState
      icon="search"
      title="Search events and tasks"
      body="Find anything by a word from its title, notes, place, guests or calendar, from the past or ahead."
    />
  );
}

function Offline(): ReactNode {
  return (
    <EmptyState
      icon="cloudOff"
      title="Search needs the hub"
      body="Events and tasks are searched on the hub. Results show when it is reachable."
    />
  );
}

interface BodyProps {
  readonly settled: string;
  readonly live: boolean;
  readonly pages: PlannerSearchPages;
  readonly filter: PlannerSearchFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly onClear: () => void;
}

function SearchBody({ settled, live, pages, filter, collections, onClear }: BodyProps): ReactNode {
  if (settled === '') return <Start />;
  if (!live && pages.data === undefined) return <Offline />;
  return <Results pages={pages} filter={filter} collections={collections} onClear={onClear} />;
}

function showsNoMatches(settled: string, pages: PlannerSearchPages): boolean {
  return settled !== '' && pages.data !== undefined && hitsOf(pages.data.pages).length === 0;
}

function subtitleOf(settled: string, pages: PlannerSearchPages): string | undefined {
  if (settled === '' || pages.data === undefined) return undefined;
  return foundTextOf(hitsOf(pages.data.pages).length, pages.hasNextPage);
}

export function PlannerSearchScreen({ initial }: { readonly initial: string }): ReactNode {
  const person = usePlannerShownPerson();
  const [text, setText] = useState(initial);
  const [filter, setFilter] = useState<PlannerSearchFilter>(() => emptyFilter(initial.trim()));
  const settled = useDebouncedValue(text.trim(), SETTLE_MS);
  const live = useSyncStatus().status === 'live';
  const query = { ...filter, text: settled };
  const pages = usePlannerSearch(person, query, live);
  const collections = searchCollectionsOf(
    usePlannerCalendars(person),
    usePlannerCollections(person),
  );
  const subtitle = subtitleOf(settled, pages);
  return (
    <PageShell
      title="Search the Planner"
      search={{
        value: text,
        onChange: setText,
        placeholder: 'Search events and tasks',
        label: 'Search the Planner',
        focusOnMount: true,
      }}
      toolbar={
        <SearchFilters
          filter={filter}
          collections={collections}
          onChange={setFilter}
          clearable={!showsNoMatches(settled, pages)}
        />
      }
      overflow={OVERFLOW}
      settings={mainPageSettings('planner')}
      {...(subtitle === undefined ? {} : { subtitle })}
    >
      <SearchBody
        settled={settled}
        live={live}
        pages={pages}
        filter={query}
        collections={collections}
        onClear={() => {
          setFilter(emptyFilter(settled));
        }}
      />
    </PageShell>
  );
}
