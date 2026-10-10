import type { NetworkClient, RouterSnapshot } from '@smarteverything/domain';
import { useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Badge } from '../../components/badge';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { SearchField } from '../../components/search-field';
import { List } from '../../components/section';
import { Segmented } from '../../components/segmented';
import { Skeleton } from '../../components/skeleton';
import { joinParts, plural } from '../../format/text';
import { useProfiles } from '../../store/people';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import {
  CLIENT_FILTERS,
  connectionText,
  FILTER_LABEL,
  visibleClients,
  type ClientFilter,
} from './client-model';
import { ClientSheet } from './client-sheet';
import { routerNotice, useRouterSnapshot } from './router-data';

const PAGE = 40;

function ClientRow({
  client,
  owner,
  onPress,
}: {
  readonly client: NetworkClient;
  readonly owner: string | null;
  readonly onPress: () => void;
}): ReactNode {
  return (
    <ListRow
      title={client.name}
      subtitle={joinParts([connectionText(client), client.ip, owner])}
      icon={client.connection === 'wired' ? 'monitor' : 'smartphone'}
      iconTone={client.connected ? 'primary' : 'faint'}
      trailing={client.blocked ? <Badge label="Blocked" tone="critical" icon="ban" /> : null}
      chevron
      onPress={onPress}
    />
  );
}

function Filters({
  query,
  onQuery,
  filter,
  onFilter,
}: {
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly filter: ClientFilter;
  readonly onFilter: (filter: ClientFilter) => void;
}): ReactNode {
  return (
    <View className="gap-3">
      <SearchField
        value={query}
        onChange={onQuery}
        placeholder="Name, address or MAC"
        variant="field"
      />
      <Segmented
        label="Show"
        options={CLIENT_FILTERS.map((value) => ({ value, label: FILTER_LABEL[value] }))}
        value={filter}
        onChange={onFilter}
      />
    </View>
  );
}

function ClientList({ snapshot }: { readonly snapshot: RouterSnapshot }): ReactNode {
  const params = useLocalSearchParams<{ mac?: string }>();
  const profiles = useProfiles();
  const [filter, setFilter] = useState<ClientFilter>(params.mac === undefined ? 'online' : 'all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openMac, setOpenMac] = useState<string | null>(params.mac ?? null);
  const clients = visibleClients(snapshot.clients, filter, query);
  const ownerOf = (client: NetworkClient): string | null =>
    profiles.find((profile) => profile.id === client.profileId)?.name ?? null;
  const open = snapshot.clients.find((client) => client.mac === openMac) ?? null;
  return (
    <View className="gap-section-gap">
      <Filters query={query} onQuery={setQuery} filter={filter} onFilter={setFilter} />
      {clients.length === 0 ? (
        <EmptyState icon="wifi" title="No devices here" body="Try another filter or search." />
      ) : (
        <List title={plural(clients.length, 'device')}>
          {clients.slice(0, shown).map((client) => (
            <ClientRow
              key={client.mac}
              client={client}
              owner={ownerOf(client)}
              onPress={() => {
                setOpenMac(client.mac);
              }}
            />
          ))}
          {clients.length > shown ? (
            <ListRow
              title={`Show ${String(Math.min(PAGE, clients.length - shown))} more`}
              icon="chevronDown"
              onPress={() => {
                setShown(shown + PAGE);
              }}
            />
          ) : null}
        </List>
      )}
      <ClientSheet
        client={open}
        snapshot={snapshot}
        onClose={() => {
          setOpenMac(null);
        }}
      />
    </View>
  );
}

export function ClientsSection(): ReactNode {
  const stream = useRouterSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="router" notice={routerNotice(stream.value)} />
      {stream.value.clients.length === 0 ? (
        <EmptyState
          icon="wifi"
          title="No devices yet"
          body="Devices show up once the router reports them."
        />
      ) : (
        <ClientList snapshot={stream.value} />
      )}
    </View>
  );
}
