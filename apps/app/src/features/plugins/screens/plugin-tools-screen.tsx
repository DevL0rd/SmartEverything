import type { ReactNode } from 'react';
import { useDeferredValue, useState } from 'react';
import { View } from 'react-native';
import type { PluginRow, PluginToolRow } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { SwitchRow } from '../../../components/rows';
import { Text } from '../../../components/text';
import { VirtualList } from '../../../components/virtual-list';
import { joinParts, plural } from '../../../format/text';
import { SettingsFrame } from '../../../settings/settings-frame';
import { useQueryClient } from '@tanstack/react-query';
import { switchTool } from '../data/plugin-actions';
import { useEntityStore } from '../../../store/store-context';
import { usePluginTools } from '../data/plugin-queries';
import { PluginListLoading } from './plugin-list-loading';
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
  const reach = reachOf(tool);
  const store = useEntityStore();
  const client = useQueryClient();
  return (
    <SwitchRow
      title={tool.title}
      wrapTitle
      label={joinParts([tool.title, reach, tool.name === tool.title ? null : tool.name])}
      subtitle={reach}
      value={tool.enabled}
      onChange={(on) => {
        background(switchTool(store, client, row, { tool, on }), 'plugin.tool_switch_failed');
      }}
    />
  );
}

function ToolList({ row, query }: { readonly row: PluginRow; readonly query: string }): ReactNode {
  const tools = usePluginTools(row);
  const deferred = useDeferredValue(query);
  if (row.status !== 'running') {
    return (
      <EmptyState icon="wrench" title="Not running" body="Switch the plugin on to see its tools." />
    );
  }
  if (tools.isError) {
    return (
      <View className="mx-gutter">
        <ErrorState
          error={tools.error}
          retry={() => {
            background(tools.refetch(), 'tools.refetch_failed');
          }}
        />
      </View>
    );
  }
  if (tools.data === undefined) {
    return <PluginListLoading label="Loading plugin tools" />;
  }
  const shown = matching(tools.data, deferred);
  const title = shown.length === 0 ? null : plural(shown.length, 'tool');
  return (
    <VirtualList
      sections={[{ key: 'all', title, data: shown }]}
      keyOf={(tool) => tool.name}
      renderItem={(tool) => <ToolRow row={row} tool={tool} />}
      header={
        <View className="px-gutter pt-2">
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
  const [query, setQuery] = useState('');
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
      {...(row.status === 'running'
        ? { search: { value: query, onChange: setQuery, placeholder: 'Search tools' } }
        : {})}
    >
      <View className="-mx-gutter min-h-0 flex-1">
        <ToolList row={row} query={query} />
      </View>
    </SettingsFrame>
  );
}
