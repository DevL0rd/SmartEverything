import { background } from '@smarteverything/logging';
import Head from 'expo-router/head';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { ListRow } from '../../../components/list-row';
import { PageHeader } from '../../../components/page-header';
import { Screen } from '../../../components/screen';
import { SearchField } from '../../../components/search-field';
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

function Looking(): ReactNode {
  return (
    <View className="gap-3">
      <Skeleton shape="block" />
      <Skeleton shape="block" />
      <Skeleton shape="block" />
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

interface HeaderProps {
  readonly text: string;
  readonly onText: (text: string) => void;
  readonly subtitle: string | undefined;
  readonly filter: PlannerSearchFilter;
  readonly collections: readonly PlannerCollectionRow[];
  readonly onFilter: (filter: PlannerSearchFilter) => void;
}

function SearchHeader(props: HeaderProps): ReactNode {
  return (
    <PageHeader
      title="Search the Planner"
      {...(props.subtitle === undefined ? {} : { subtitle: props.subtitle })}
      below={
        <View className="gap-3">
          <SearchField
            value={props.text}
            onChange={props.onText}
            placeholder="Search events and tasks"
            focusOnMount
            variant="bar"
          />
          <SearchFilters
            filter={props.filter}
            collections={props.collections}
            onChange={props.onFilter}
          />
        </View>
      }
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
  return (
    <Screen
      maxWidth="detail"
      header={
        <SearchHeader
          text={text}
          onText={setText}
          subtitle={subtitleOf(settled, pages)}
          filter={filter}
          collections={collections}
          onFilter={setFilter}
        />
      }
    >
      <Head>
        <title>Search the Planner · SmartEverything</title>
      </Head>
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
    </Screen>
  );
}
