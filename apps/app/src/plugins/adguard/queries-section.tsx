import { usePluginScreen } from '../shared/plugin-log';
import type { AdGuardQuery, AdGuardSnapshot, QueryLogFilter } from '@smarteverything/domain';
import { QUERY_LOG_FILTERS } from '@smarteverything/domain';
import { useMemo, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../components/banner';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { FilterChip } from '../../components/filter-chip';
import { HScroller } from '../../components/h-scroller';
import { SearchField } from '../../components/search-field';
import { Skeleton } from '../../components/skeleton';
import { Text } from '../../components/text';
import { VirtualList } from '../../components/virtual-list';
import { useMinute } from '../../store/clock';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { useSectionParam } from '../../components/use-section-param';
import { adguardNotice, useAdGuardSnapshot, useQueryLog, type QueryLogView } from './adguard-data';
import { ClientSheet } from './client-sheet';
import {
  FILTER_ICON,
  FILTER_LABEL,
  filterCounts,
  filterOf,
  lookupKey,
  lookupSections,
  sameLookup,
} from './query-outcome';
import { QueryRow } from './query-row';
import { QuerySheet } from './query-sheet';
import { periodText } from './stats-period';

interface Controls {
  readonly search: string;
  readonly onSearch: (search: string) => void;
  readonly filter: QueryLogFilter;
  readonly onFilter: (filter: QueryLogFilter) => void;
  readonly stats: AdGuardSnapshot['stats'];
  readonly log: QueryLogView;
}

function CountsNote({
  stats,
}: {
  readonly stats: NonNullable<AdGuardSnapshot['stats']>;
}): ReactNode {
  return <Text variant="caption" tone="variant">{`Counts cover the ${periodText(stats)}.`}</Text>;
}

function ListControls({ search, onSearch, filter, onFilter, stats, log }: Controls): ReactNode {
  const counts = stats === null || search.trim() !== '' ? null : filterCounts(stats);
  return (
    <View className="gap-3 px-gutter pb-2 pt-2">
      <SearchField
        value={search}
        onChange={onSearch}
        placeholder="Domain or device"
        variant="field"
      />
      <HScroller label="Filter lookups" fade>
        {QUERY_LOG_FILTERS.map((value) => (
          <FilterChip
            key={value}
            label="Show"
            value={FILTER_LABEL[value]}
            icon={FILTER_ICON[value]}
            {...(counts === null ? {} : { count: counts[value] })}
            active={filter === value}
            onPress={() => {
              onFilter(value);
            }}
          />
        ))}
      </HScroller>
      {counts === null || stats === null ? null : <CountsNote stats={stats} />}
      {log.failed ? (
        <Banner
          tone="critical"
          title="The query log could not be read"
          body="AdGuard Home did not answer."
          wrapBody
          action={{ label: 'Try again', onPress: log.reload }}
        />
      ) : null}
    </View>
  );
}

function LoadOlder({ log }: { readonly log: QueryLogView }): ReactNode {
  return log.more ? (
    <View className="items-center px-gutter py-2">
      <Button
        label="Load older lookups"
        variant="text"
        loading={log.loading}
        onPress={log.loadOlder}
      />
    </View>
  ) : (
    <View />
  );
}

function Empty({ log }: { readonly log: QueryLogView }): ReactNode {
  return log.loading ? (
    <View className="px-gutter">
      <Skeleton shape="block" />
    </View>
  ) : (
    <EmptyState
      icon="search"
      title="No lookups here"
      body="Try another filter or a shorter search."
    />
  );
}

interface Initial {
  readonly search: string;
  readonly filter: QueryLogFilter;
  readonly client: string | null;
}

function LookupSheets({
  rules,
  open,
  client,
  onOpen,
  onClient,
  onSearch,
}: {
  readonly rules: readonly string[];
  readonly open: AdGuardQuery | null;
  readonly client: string | null;
  readonly onOpen: (query: AdGuardQuery | null) => void;
  readonly onClient: (client: string | null) => void;
  readonly onSearch: (search: string) => void;
}): ReactNode {
  return (
    <>
      <QuerySheet
        query={open}
        rules={rules}
        onClose={() => {
          onOpen(null);
        }}
        onDevice={(query) => {
          onOpen(null);
          onClient(query.client);
        }}
      />
      <ClientSheet
        client={client}
        onClose={() => {
          onClient(null);
        }}
        onShowLookups={onSearch}
      />
    </>
  );
}

interface ListState {
  readonly search: string;
  readonly onSearch: (search: string) => void;
  readonly filter: QueryLogFilter;
  readonly onFilter: (filter: QueryLogFilter) => void;
}

function LookupList({
  state,
  stats,
  onOpen,
}: {
  readonly state: ListState;
  readonly stats: AdGuardSnapshot['stats'];
  readonly onOpen: (query: AdGuardQuery) => void;
}): ReactNode {
  const now = useMinute();
  const log = useQueryLog(state.search.trim(), state.filter);
  const sections = useMemo(() => lookupSections(log.entries, now), [log.entries, now]);
  return (
    <VirtualList
      sections={sections}
      keyOf={lookupKey}
      sameItem={sameLookup}
      renderItem={(item) => (
        <QueryRow
          item={item}
          onPress={() => {
            onOpen(item.query);
          }}
        />
      )}
      header={<ListControls {...state} stats={stats} log={log} />}
      footer={<LoadOlder log={log} />}
      {...(log.failed ? {} : { empty: <Empty log={log} /> })}
    />
  );
}

function QueryLog({
  snapshot,
  initial,
}: {
  readonly snapshot: AdGuardSnapshot;
  readonly initial: Initial;
}): ReactNode {
  const [search, setSearch] = useState(initial.search);
  const [filter, setFilter] = useState(initial.filter);
  const [open, setOpen] = useState<AdGuardQuery | null>(null);
  const [client, setClient] = useState(initial.client);
  const state = { search, onSearch: setSearch, filter, onFilter: setFilter };
  return (
    <View className="-mx-gutter flex-1">
      <LookupList state={state} stats={snapshot.stats} onOpen={setOpen} />
      <LookupSheets
        rules={snapshot.userRules}
        open={open}
        client={client}
        onOpen={setOpen}
        onClient={setClient}
        onSearch={setSearch}
      />
    </View>
  );
}

export function QueriesSection(): ReactNode {
  usePluginScreen('adguard', 'QueriesSection');
  const [search] = useSectionParam('search');
  const [client] = useSectionParam('client');
  const [filter] = useSectionParam('filter');
  const initial = { search: search ?? '', filter: filterOf(filter), client };
  return (
    <PluginStreamSection
      stream={useAdGuardSnapshot()}
      pluginId="adguard"
      notice={adguardNotice}
      fill
    >
      {(snapshot) =>
        snapshot.connection.state === 'online' ? (
          <QueryLog
            key={`${initial.filter}|${initial.search}|${initial.client ?? ''}`}
            snapshot={snapshot}
            initial={initial}
          />
        ) : null
      }
    </PluginStreamSection>
  );
}
