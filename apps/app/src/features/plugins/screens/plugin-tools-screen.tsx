import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import type { PluginRow, PluginToolRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { SwitchRow } from '../../../components/rows';
import { SearchField } from '../../../components/search-field';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { plural } from '../../../format/text';
import { SettingsFrame } from '../../../settings/settings-frame';
import { changePlugin } from '../data/plugin-actions';
import { usePluginTools } from '../data/plugin-queries';
import { MissingPlugin, usePluginParam } from './plugin-screen';
import { background } from '@smarteverything/logging';

function reachOf(tool: PluginToolRow): string {
  if (tool.human_only) {
    return 'Only people can use it';
  }
  if (tool.read_only) {
    return 'Reads';
  }
  return tool.destructive ? 'Can remove things' : 'Can change things';
}

function matching(tools: readonly PluginToolRow[], query: string): readonly PluginToolRow[] {
  const needle = query.trim().toLowerCase();
  return needle === ''
    ? tools
    : tools.filter((tool) =>
        `${tool.title} ${tool.name} ${tool.description}`.toLowerCase().includes(needle),
      );
}

function ToolRow({
  row,
  tool,
}: {
  readonly row: PluginRow;
  readonly tool: PluginToolRow;
}): ReactNode {
  return (
    <SwitchRow
      title={tool.title}
      subtitle={reachOf(tool)}
      value={tool.enabled}
      onChange={(on) => {
        background(
          changePlugin(row, { tool_switches: { [tool.name]: on } }, `${tool.title} wasn’t changed`),
          'plugin.change_failed',
        );
      }}
    />
  );
}

function ToolList({ row }: { readonly row: PluginRow }): ReactNode {
  const tools = usePluginTools(row);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  if (row.status !== 'running') {
    return (
      <EmptyState icon="wrench" title="Not running" body="Switch the plugin on to see its tools." />
    );
  }
  if (tools.isError) {
    return (
      <ErrorState
        error={tools.error}
        retry={() => {
          background(tools.refetch(), 'tools.refetch_failed');
        }}
      />
    );
  }
  if (tools.data === undefined) {
    return <Skeleton shape="block" className="mx-gutter h-56" />;
  }
  const shown = matching(tools.data, deferred);
  return (
    <VirtualList
      sections={[{ key: 'all', title: plural(shown.length, 'tool'), data: shown }]}
      keyOf={(tool) => tool.name}
      renderItem={(tool) => <ToolRow row={row} tool={tool} />}
      header={
        <View className="gap-2 px-gutter pt-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search tools" />
          <Text variant="footnote" tone="variant">
            Your AI can use the tools that are on.
          </Text>
        </View>
      }
      empty={
        <Text variant="body" tone="variant" className="px-gutter py-6">
          {deferred.trim() === ''
            ? 'This plugin offers no tools.'
            : `Nothing matches “${deferred.trim()}”.`}
        </Text>
      }
    />
  );
}

export function PluginToolsScreen({
  pluginId,
}: {
  readonly pluginId: string | undefined;
}): ReactNode {
  const row = usePluginParam(pluginId);
  if (row === null) {
    return <MissingPlugin />;
  }
  return (
    <SettingsFrame
      page="plugins"
      title="Tools"
      detail
      scroll={false}
      trail={[{ label: row.manifest.name, href: href.pluginSettings(row.id) }]}
    >
      <ToolList row={row} />
    </SettingsFrame>
  );
}
