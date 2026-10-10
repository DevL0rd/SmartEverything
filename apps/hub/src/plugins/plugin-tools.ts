import { pluginToolName, type PluginRow } from '@smarteverything/domain';
import { failure, type HubTool, type HubToolResult, type ToolSource } from '../ai-tools/hub-tool';
import type { PluginHost } from './host';
import type { RuntimeTool } from './runtime';

function pluginHubTool(plugin: PluginRow, tool: RuntimeTool): HubTool {
  return {
    name: pluginToolName(plugin.id, tool.name),
    title: `${plugin.manifest.name}: ${tool.title}`,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
    origin: { kind: 'plugin', pluginId: plugin.id },
    humanOnly: tool.humanOnly,
  };
}

function offered(host: PluginHost): HubTool[] {
  return host
    .running()
    .filter(({ tool }) => !tool.humanOnly)
    .map(({ plugin, tool }) => pluginHubTool(plugin, tool));
}

export function pluginToolSource(host: PluginHost): ToolSource {
  return {
    tools: () => offered(host),
    call: (tool, args, caller): Promise<HubToolResult> => {
      if (tool.origin.kind !== 'plugin') {
        return Promise.resolve(failure('Not a plugin tool'));
      }
      const name = tool.name.slice(pluginToolName(tool.origin.pluginId, '').length);
      return host.call(tool.origin.pluginId, name, args, caller);
    },
    validate: () => null,
    changes: (listener) => host.changes(listener),
  };
}
