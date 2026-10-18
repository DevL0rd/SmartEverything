import type {
  AgentDefinition,
  AgentMcpServerSpec,
  McpServerConfigForProcessTransport,
} from '@anthropic-ai/claude-agent-sdk';
import type { ClaudeProviderOptions, ClaudeMcpServers } from '@smarteverything/domain';

type Agent = NonNullable<ClaudeProviderOptions['agents']>[string];
type Server = ClaudeMcpServers[string];

export function agentDefinitions(
  options: ClaudeProviderOptions,
): Record<string, AgentDefinition> | undefined {
  if (options.agents === undefined) return undefined;
  return Object.fromEntries(
    Object.entries(options.agents).map(([name, agent]) => [
      name,
      {
        description: agent.description,
        prompt: agent.prompt,
        ...toolsOf(agent),
        ...contextOf(agent),
        ...behaviorOf(agent),
        ...observerOf(agent),
      },
    ]),
  );
}
function toolsOf(agent: Agent): Partial<AgentDefinition> {
  return {
    ...(agent.tools === undefined ? {} : { tools: agent.tools }),
    ...(agent.disallowedTools === undefined ? {} : { disallowedTools: agent.disallowedTools }),
    ...(agent.mcpServers === undefined ? {} : { mcpServers: agent.mcpServers.map(serverSpec) }),
    ...(agent.model === undefined ? {} : { model: agent.model }),
    ...(agent.skills === undefined ? {} : { skills: agent.skills }),
  };
}
function contextOf(agent: Agent): Partial<AgentDefinition> {
  return {
    ...(agent.initialPrompt === undefined ? {} : { initialPrompt: agent.initialPrompt }),
    ...(agent.maxTurns === undefined ? {} : { maxTurns: agent.maxTurns }),
    ...(agent.autoCompactWindow === undefined
      ? {}
      : { autoCompactWindow: agent.autoCompactWindow }),
    ...(agent.criticalSystemReminder_EXPERIMENTAL === undefined
      ? {}
      : { criticalSystemReminder_EXPERIMENTAL: agent.criticalSystemReminder_EXPERIMENTAL }),
  };
}
function behaviorOf(agent: Agent): Partial<AgentDefinition> {
  return {
    ...(agent.background === undefined ? {} : { background: agent.background }),
    ...(agent.omitClaudeMd === undefined ? {} : { omitClaudeMd: agent.omitClaudeMd }),
    ...(agent.memory === undefined ? {} : { memory: agent.memory }),
    ...(agent.effort === undefined ? {} : { effort: agent.effort }),
    ...(agent.permissionMode === undefined ? {} : { permissionMode: agent.permissionMode }),
  };
}
function observerOf(agent: Agent): Partial<AgentDefinition> {
  return {
    ...(agent.observer === undefined ? {} : { observer: agent.observer }),
    ...(agent.observerMessage === undefined ? {} : { observerMessage: agent.observerMessage }),
  };
}
function serverSpec(server: string | ClaudeMcpServers): AgentMcpServerSpec {
  if (typeof server === 'string') return server;
  return Object.fromEntries(
    Object.entries(server).map(([name, config]) => [name, transportConfig(config)]),
  );
}
function transportConfig(server: Server): McpServerConfigForProcessTransport {
  if (server.type === 'stdio')
    return {
      type: server.type,
      command: server.command,
      ...(server.args === undefined ? {} : { args: server.args }),
      ...(server.env === undefined ? {} : { env: server.env }),
      ...transportOptions(server),
    };
  return {
    type: server.type,
    url: server.url,
    ...(server.headers === undefined ? {} : { headers: server.headers }),
    ...(server.tools === undefined
      ? {}
      : {
          tools: server.tools.map((tool) => ({
            name: tool.name,
            ...(tool.permission_policy === undefined
              ? {}
              : { permission_policy: tool.permission_policy }),
            ...(tool.org_max_permission === undefined
              ? {}
              : { org_max_permission: tool.org_max_permission }),
          })),
        }),
    ...transportOptions(server),
  };
}
function transportOptions(server: Server): { timeout?: number; alwaysLoad?: boolean } {
  return {
    ...(server.timeout === undefined ? {} : { timeout: server.timeout }),
    ...(server.alwaysLoad === undefined ? {} : { alwaysLoad: server.alwaysLoad }),
  };
}
