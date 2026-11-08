import { MCP_TOOLS, PLUGIN_TOOL_SEPARATOR, isMcpToolName } from '@smarteverything/domain';

const TITLES: ReadonlyMap<string, string> = new Map(
  MCP_TOOLS.map((tool) => [tool.name, tool.title]),
);

const TOOL_TITLES: ReadonlyMap<string, string> = new Map([
  ['get_goal', 'Check the goal'],
  ['create_goal', 'Set a goal'],
  ['update_goal', 'Update the goal'],
  ['workflow', 'Run a workflow'],
  ['ralph', 'Run a ralph loop'],
  ['memory', 'Use memory'],
  ['subagent', 'Start an agent'],
  ['list_subagent_models', 'List agent models'],
  ['send_message', 'Send message'],
  ['interrupt_agent', 'Interrupt an agent'],
  ['terminal_open', 'Open a terminal'],
  ['terminal_send', 'Type in a terminal'],
  ['terminal_read', 'Read a terminal'],
  ['terminal_signal', 'Signal a terminal'],
  ['terminal_list', 'List terminals'],
  ['terminal_close', 'Close a terminal'],
]);

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
  const titled = TOOL_TITLES.get(name);
  if (titled !== undefined) {
    return titled;
  }
  const at = name.indexOf(PLUGIN_TOOL_SEPARATOR);
  if (at < 0) {
    return sentence(name);
  }
  const pluginId = name.slice(0, at);
  const tool = phrase(name.slice(at + PLUGIN_TOOL_SEPARATOR.length));
  return `${pluginName(pluginId) ?? sentence(pluginId)}: ${tool}`;
}
