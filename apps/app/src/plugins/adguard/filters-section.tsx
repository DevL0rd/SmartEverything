import { usePluginScreen } from '../shared/plugin-log';
import type { AdGuardFilter, AdGuardSnapshot } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyState } from '../../components/empty-state';
import { SwitchRow } from '../../components/rows';
import { List } from '../../components/section';
import { PluginStreamSection } from '../shared/plugin-stream-section';
import { useAdGuardSnapshot, useAdGuardTools } from './adguard-data';
import { filterMeta } from './model/filter-meta';
import { MyRules } from './model/my-rules';
import { background } from '@smarteverything/logging';

function FilterRow({
  filter,
  now,
}: {
  readonly filter: AdGuardFilter;
  readonly now: number;
}): ReactNode {
  const tools = useAdGuardTools();
  return (
    <SwitchRow
      title={filter.name}
      subtitle={filterMeta(filter, now)}
      value={filter.enabled}
      onChange={(enabled) => {
        background(
          tools.run(
            enabled ? 'enable_filter' : 'disable_filter',
            { filterId: filter.id },
            `${filter.name} wasn’t ${enabled ? 'switched on' : 'switched off'}`,
          ),
          'tools.run_failed',
        );
      }}
    />
  );
}

function FilterGroup({
  title,
  filters,
  now,
}: {
  readonly title: string;
  readonly filters: readonly AdGuardFilter[];
  readonly now: number;
}): ReactNode {
  return filters.length === 0 ? null : (
    <List title={title}>
      {filters.map((filter) => (
        <FilterRow key={filter.id} filter={filter} now={now} />
      ))}
    </List>
  );
}

function Lists({ snapshot }: { readonly snapshot: AdGuardSnapshot }): ReactNode {
  const { filters } = snapshot;
  const now = Date.parse(snapshot.at);
  return (
    <View className="gap-section-gap">
      {filters.length === 0 ? (
        <EmptyState
          icon="filter"
          title="No filter lists"
          body="Lists you add in AdGuard Home show up here."
        />
      ) : (
        <>
          <FilterGroup
            title="Block lists"
            filters={filters.filter((filter) => !filter.allowList)}
            now={now}
          />
          <FilterGroup
            title="Allow lists"
            filters={filters.filter((filter) => filter.allowList)}
            now={now}
          />
        </>
      )}
      <MyRules rules={snapshot.userRules} />
    </View>
  );
}

export function FiltersSection(): ReactNode {
  usePluginScreen('adguard', 'FiltersSection');
  return (
    <PluginStreamSection stream={useAdGuardSnapshot()} pluginId="adguard">
      {(snapshot) =>
        snapshot.connection.state === 'online' ? <Lists snapshot={snapshot} /> : null
      }
    </PluginStreamSection>
  );
}
