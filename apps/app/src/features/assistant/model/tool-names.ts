import { MCP_TOOLS, PLUGIN_TOOL_SEPARATOR, isMcpToolName } from '@smarteverything/domain';

const TITLES: ReadonlyMap<string, string> = new Map(
  MCP_TOOLS.map((tool) => [tool.name, tool.title]),
);

function phrase(words: string): string {
  return words.replace(/[_-]+/g, ' ').trim().toLowerCase();
}

function sentence(words: string): string {
  const text = phrase(words);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function toolDisplayName(
  name: string,
  pluginName: (pluginId: string) => string | null,
): string {
  const known = isMcpToolName(name) ? TITLES.get(name) : undefined;
  if (known !== undefined) {
    return known;
  }
  const at = name.indexOf(PLUGIN_TOOL_SEPARATOR);
  if (at < 0) {
    return sentence(name);
  }
  const pluginId = name.slice(0, at);
  const tool = phrase(name.slice(at + PLUGIN_TOOL_SEPARATOR.length));
  return `${pluginName(pluginId) ?? sentence(pluginId)}: ${tool}`;
}
