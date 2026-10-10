import { MCP_TOOL_AREA_LABELS } from './mcp/areas';
import type { PluginManifest } from './plugins';

export function pluginPowers(manifest: PluginManifest): string[] {
  const { permissions } = manifest;
  const areas = permissions.seAreas.map((area) => MCP_TOOL_AREA_LABELS[area]);
  return [
    ...(permissions.inbound ? ['Post messages into your AI chats'] : []),
    ...(permissions.voice ? ['Start voice conversations with your AI'] : []),
    ...(areas.length > 0 ? [`Use SmartEverything tools: ${areas.join(', ')}`] : []),
  ];
}

export function pluginAdds(manifest: PluginManifest): string[] {
  const { contributes } = manifest;
  const counted = (count: number, one: string, many: string): string[] =>
    count === 0 ? [] : [`${String(count)} ${count === 1 ? one : many}`];
  return [
    ...counted(contributes.widgets.length, 'widget', 'widgets'),
    ...counted(contributes.data.length, 'live value', 'live values'),
    ...counted(contributes.events.length, 'automation trigger', 'automation triggers'),
    ...counted(contributes.deviceFamilies.length, 'kind of device', 'kinds of device'),
    ...(contributes.search === null ? [] : ['Search results']),
  ];
}
