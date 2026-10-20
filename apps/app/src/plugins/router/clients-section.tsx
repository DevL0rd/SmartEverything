import { usePluginScreen } from '../shared/plugin-log';
import type { RouterSnapshot } from '@smarteverything/domain';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/empty-state';
import { Icon } from '../../components/icon';
import { Interactive } from '../../components/interactive';
import { Text } from '../../components/text';
import { VirtualList } from '../../components/virtual-list';
import { useMinute } from '../../store/clock';
import { useProfiles } from '../../store/people';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { useSectionParam } from '../../components/use-section-param';
import {
  clientEntries,
  clientKey,
  clientSections,
  filterCounts,
  initialFilter,
  sameItem,
  type ClientFilter,
  type ClientItem,
  type ClientSort,
  type ClientView,
} from './client-model';
import { ClientSheet } from './client-sheet';
import { ClientControls } from './clients/client-controls';
import { ClientRow } from './clients/client-row';
import { PeopleManager } from './clients/people-manager';
import { routerNotice, useRouterSnapshot } from './router-data';

function OfflineToggle({
  count,
  open,
  onPress,
}: {
  readonly count: number;
  readonly open: boolean;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <Interactive
      label={`${open ? 'Hide' : 'Show'} ${String(count)} offline`}
      expanded={open}
      onPress={onPress}
      className="min-h-touch-min flex-row items-center gap-2 px-4"
    >
      <Icon name={open ? 'chevronDown' : 'chevronRight'} size={20} tone="variant" />
      <Text variant="callout" tone="primary">
        {open ? 'Hide offline' : 'Show offline'}
      </Text>
    </Interactive>
  );
}

function useOwners(snapshot: RouterSnapshot): ReadonlyMap<string, string> {
  const profiles = useProfiles();
  return useMemo(
    () =>
      new Map([
        ...profiles.map((profile) => [profile.id, profile.name] as const),
        ...snapshot.people.map((person) => [person.id, person.name] as const),
      ]),
    [profiles, snapshot.people],
  );
}

interface ClientListState {
  readonly view: ClientView;
  readonly setFilter: (filter: ClientFilter) => void;
  readonly setQuery: (query: string) => void;
  readonly setSort: (sort: ClientSort) => void;
  readonly setOfflineOpen: (open: boolean) => void;
  readonly clearBand: () => void;
}

function useClientListState(snapshot: RouterSnapshot, mac: string | null): ClientListState {
  const [band, , clearBand] = useSectionParam('band');
  const [initial] = useSectionParam('filter');
  const [filter, setFilter] = useState<ClientFilter>(() =>
    initialFilter(snapshot.clients, initial, mac),
  );
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ClientSort>('online');
  const [offlineOpen, setOfflineOpen] = useState(false);
  return {
    view: { filter, band, query, sort, offlineOpen },
    setFilter,
    setQuery,
    setSort,
    setOfflineOpen,
    clearBand,
  };
}

function renderItem(
  item: ClientItem,
  onOpen: (mac: string) => void,
  onOffline: (open: boolean) => void,
): ReactElement {
  if (item.kind === 'offline') {
    return (
      <OfflineToggle
        count={item.count}
        open={item.open}
        onPress={() => {
          onOffline(!item.open);
        }}
      />
    );
  }
  return (
    <ClientRow
      entry={item.entry}
      onPress={() => {
        onOpen(item.entry.client.mac);
      }}
    />
  );
}

function NoMatch({ state }: { readonly state: ClientListState }): ReactNode {
  return (
    <EmptyState
      icon="search"
      title="No devices here"
      body="Try another filter or search."
      action={
        <Button
          label="Clear search"
          variant="text"
          onPress={() => {
            state.setQuery('');
            state.setFilter('all');
            state.clearBand();
          }}
        />
      }
    />
  );
}

function ClientList({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const [mac, openMac, closeMac] = useSectionParam('mac');
  const state = useClientListState(snapshot, mac);
  const owners = useOwners(snapshot);
  const now = useMinute();
  const entries = useMemo(() => clientEntries(snapshot, owners, now), [snapshot, owners, now]);
  const { view } = state;
  return (
    <View className="-mx-gutter flex-1">
      <VirtualList
        sections={clientSections(entries, view)}
        keyOf={clientKey}
        sameItem={sameItem}
        renderItem={(item) => renderItem(item, openMac, state.setOfflineOpen)}
        header={
          <>
            {view.filter === 'people' ? <PeopleManager snapshot={snapshot} /> : null}
            <ClientControls
              query={view.query}
              onQuery={state.setQuery}
              sort={view.sort}
              onSort={state.setSort}
              filter={view.filter}
              onFilter={state.setFilter}
              counts={filterCounts(entries, view.band)}
              band={view.band}
              onClearBand={state.clearBand}
            />
          </>
        }
        empty={<NoMatch state={state} />}
      />
      <ClientSheet
        client={snapshot.clients.find((client) => client.mac === mac) ?? null}
        snapshot={snapshot}
        onClose={closeMac}
      />
    </View>
  );
}

export function ClientsSection(): ReactNode {
  usePluginScreen('router', 'ClientsSection');
  return (
    <PluginStreamSection stream={useRouterSnapshot()} pluginId="router" notice={routerNotice} fill>
      {(snapshot) =>
        snapshot.clients.length === 0 ? (
          <EmptyState
            icon="wifi"
            title="No devices yet"
            body="Devices show up once the router reports them."
          />
        ) : (
          <ClientList snapshot={snapshot} />
        )
      }
    </PluginStreamSection>
  );
}
