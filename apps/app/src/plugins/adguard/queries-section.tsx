import { QUERY_LOG_FILTERS, type AdGuardQuery, type QueryLogFilter } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Banner } from '../../components/banner';
import { EmptyState } from '../../components/empty-state';
import { ListRow } from '../../components/list-row';
import { SearchField } from '../../components/search-field';
import { List } from '../../components/section';
import { Segmented } from '../../components/segmented';
import { Skeleton } from '../../components/skeleton';
import { joinParts } from '../../format/text';
import { clock } from '../../format/time';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { adguardNotice, useAdGuardSnapshot, useQueryLog, type QueryLogView } from './adguard-data';
import { FILTER_LABEL, OUTCOME_LOOK } from './query-outcome';
import { QuerySheet } from './query-sheet';

function QueryRow({
  query,
  onPress,
}: {
  readonly query: AdGuardQuery;
  readonly onPress: () => void;
}): ReactNode {
  const look = OUTCOME_LOOK[query.outcome];
  return (
    <ListRow
      title={query.domain}
      subtitle={joinParts([clock(query.time), query.clientName ?? query.client])}
      icon={look.icon}
      iconTone={look.tone}
      chevron
      onPress={onPress}
    />
  );
}

function Rows({
  log,
  onOpen,
}: {
  readonly log: QueryLogView;
  readonly onOpen: (query: AdGuardQuery) => void;
}): ReactNode {
  if (log.entries.length === 0) {
    return log.loading ? (
      <Skeleton shape="block" />
    ) : (
      <EmptyState icon="search" title="No lookups found" body="Try another filter or search." />
    );
  }
  return (
    <List title="Newest first">
      {log.entries.map((query, index) => (
        <QueryRow
          key={`${query.time}:${query.domain}:${String(index)}`}
          query={query}
          onPress={() => {
            onOpen(query);
          }}
        />
      ))}
      {log.more ? (
        <ListRow
          title={log.loading ? 'Loading…' : 'Load older lookups'}
          icon="chevronDown"
          onPress={log.loadOlder}
        />
      ) : null}
    </List>
  );
}

function QueryLog({ rules }: { readonly rules: readonly string[] }): ReactNode {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<QueryLogFilter>('all');
  const [open, setOpen] = useState<AdGuardQuery | null>(null);
  const log = useQueryLog(search.trim(), filter);
  return (
    <View className="gap-section-gap">
      <View className="gap-3">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Domain or device"
          variant="field"
        />
        <Segmented
          label="Show"
          options={QUERY_LOG_FILTERS.map((value) => ({ value, label: FILTER_LABEL[value] }))}
          value={filter}
          onChange={setFilter}
        />
      </View>
      {log.failed ? (
        <Banner
          tone="critical"
          title="The query log could not be read"
          body="AdGuard Home did not answer."
          action={{ label: 'Try again', onPress: log.reload }}
        />
      ) : null}
      <Rows log={log} onOpen={setOpen} />
      <QuerySheet
        query={open}
        rules={rules}
        onClose={() => {
          setOpen(null);
        }}
      />
    </View>
  );
}

export function QueriesSection(): ReactNode {
  const stream = useAdGuardSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  const online = stream.value.connection.state === 'online';
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="adguard" notice={adguardNotice(stream.value)} />
      {online ? <QueryLog rules={stream.value.userRules} /> : null}
    </View>
  );
}
