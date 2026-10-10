import type { AdGuardFilter } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../components/empty-state';
import { SwitchRow } from '../../components/rows';
import { List } from '../../components/section';
import { Skeleton } from '../../components/skeleton';
import { decimal } from '../../format/number';
import { joinParts } from '../../format/text';
import { shortDate } from '../../format/time';
import { PluginNotice, StreamProblem } from '../shared/plugin-notice';
import { adguardNotice, useAdGuardSnapshot, useAdGuardTools } from './adguard-data';

function FilterRow({ filter }: { readonly filter: AdGuardFilter }): ReactNode {
  const tools = useAdGuardTools();
  return (
    <SwitchRow
      title={filter.name}
      subtitle={joinParts([
        `${decimal(filter.rules)} rules`,
        filter.updatedAt === null ? null : `updated ${shortDate(filter.updatedAt)}`,
      ])}
      value={filter.enabled}
      onChange={(enabled) => {
        void tools.run(enabled ? 'enable_filter' : 'disable_filter', { filterId: filter.id });
      }}
    />
  );
}

function FilterLists({ filters }: { readonly filters: readonly AdGuardFilter[] }): ReactNode {
  const block = filters.filter((filter) => !filter.allowList);
  const allow = filters.filter((filter) => filter.allowList);
  if (filters.length === 0) {
    return (
      <EmptyState
        icon="filter"
        title="No filter lists"
        body="Add block lists in AdGuard Home and they show up here."
      />
    );
  }
  return (
    <>
      {block.length === 0 ? null : (
        <List title="Block lists">
          {block.map((filter) => (
            <FilterRow key={filter.id} filter={filter} />
          ))}
        </List>
      )}
      {allow.length === 0 ? null : (
        <List title="Allow lists">
          {allow.map((filter) => (
            <FilterRow key={filter.id} filter={filter} />
          ))}
        </List>
      )}
    </>
  );
}

export function FiltersSection(): ReactNode {
  const stream = useAdGuardSnapshot();
  if (stream.state === 'waiting') {
    return <Skeleton shape="block" />;
  }
  if (stream.state === 'invalid') {
    return <StreamProblem reason={stream.reason} />;
  }
  return (
    <View className="gap-section-gap">
      <PluginNotice pluginId="adguard" notice={adguardNotice(stream.value)} />
      {stream.value.connection.state === 'online' ? (
        <FilterLists filters={stream.value.filters} />
      ) : null}
    </View>
  );
}
