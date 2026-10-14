import type { McpServerProvenance } from '@anthropic-ai/claude-agent-sdk';
import type { ProviderTurn, ClaudeMcpServers } from '@smarteverything/domain';
import { agentServerNames } from './agent-scope';
import { permitsManagedTool } from './managed-project';
interface ToolScope {
  readonly turn: ProviderTurn;
  readonly allowed: ReadonlySet<string>;
  readonly externalServers: ClaudeMcpServers;
  readonly blocked: ReadonlySet<string>;
  readonly native: ReadonlySet<string>;
  readonly builtin: ReadonlySet<string>;
}
export function permitsProviderTool(
  scope: ToolScope,
  name: string,
  provenance: McpServerProvenance | undefined,
): boolean {
  if (scope.turn.managed_project !== undefined)
    return permitsManagedTool(name, scope.allowed, provenance);
  if (provenance !== undefined && scope.blocked.has(provenance.name)) return false;
  if (name.startsWith('mcp__home__'))
    return provenance?.source === 'sdk' && provenance.name === 'home' && scope.allowed.has(name);
  return (
    scope.allowed.has(name) ||
    [...Object.keys(scope.externalServers), ...scope.native, ...agentServerNames(scope.turn)].some(
      (server) => name.startsWith(`mcp__${server}__`),
    ) ||
    permitsBuiltin(scope, name)
  );
}

function permitsBuiltin(scope: ToolScope, name: string): boolean {
  return scope.turn.options.builtin_tools.length === 0 && scope.builtin.has(name);
}
