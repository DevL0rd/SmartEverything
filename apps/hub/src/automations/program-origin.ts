import type { AutomationV4, GraphNode, JsonValue, PluginOrigin } from '@smarteverything/domain';
import { pluginOriginOf } from '../ai-tools/plugin-turn';
import type { ToolHub } from '../ai-tools/tool-hub';
import type { Caller } from '../server/auth';

const TOOL_KIND = 'tool.call';

function literalOf(node: Pick<GraphNode, 'ports'>, port: string): JsonValue | undefined {
  const value = node.ports?.[port];
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

function isRecord(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function originOf(
  tools: Pick<ToolHub, 'pluginTurnRefusal'>,
  caller: Caller,
  program: AutomationV4,
): PluginOrigin | null {
  const plugin = caller.kind === 'client' ? pluginOriginOf(caller) : null;
  if (plugin === null) return null;
  for (const node of program.nodes.filter((candidate) => candidate.kind === TOOL_KIND)) {
    const name = literalOf(node, 'tool');
    const args = literalOf(node, 'args');
    const refusal =
      typeof name === 'string' ? tools.pluginTurnRefusal(name, isRecord(args) ? args : {}) : null;
    if (refusal !== null) throw refusal;
  }
  return plugin;
}
