import type { Options, McpServerProvenance } from '@anthropic-ai/claude-agent-sdk';
import type {
  ProviderTurn,
  ProviderControl,
  ClaudeProviderOptions,
  JsonValue,
} from '@smarteverything/domain';
import { ProviderInputError } from './input';

const LOCAL_CONTROLS = new Set([
  'set_mcp_servers',
  'read_mcp_resource',
  'seed_read_state',
  'rewind_files',
  'reload_plugins',
  'reload_skills',
  'reload_output_styles',
  'update_settings',
  'apply_flags',
]);
const LOCAL_TOOLS = [
  'Bash',
  'Read',
  'Write',
  'Edit',
  'MultiEdit',
  'NotebookEdit',
  'Glob',
  'Grep',
  'Agent',
  'Task',
  'Skill',
  'WebFetch',
  'WebSearch',
  'Computer',
  'EnterWorktree',
];
export function assertManagedTurn(turn: ProviderTurn): void {
  if (turn.managed_project === undefined) return;
  if (turn.managed_project.chat_id !== turn.chat_id || turn.options.cwd !== undefined)
    throw new ProviderInputError(
      'A managed project must name this chat and cannot select a local project directory.',
    );
  if (
    Object.keys(turn.options.flag_settings ?? {}).some(
      (key) => !['effortLevel', 'fastMode'].includes(key),
    )
  )
    throw new ProviderInputError(
      'Managed native work accepts only effortLevel and fastMode flags; other native customization requires an explicit device project.',
    );
  if (
    turn.messages.some(
      (message) =>
        message.role === 'user' &&
        message.content.some((content) => content.type === 'text' && content.text.startsWith('/')),
    )
  )
    assertManagedCommand(turn);
}
export function assertManagedCommand(turn: ProviderTurn): void {
  if (turn.managed_project !== undefined)
    throw new ProviderInputError(
      'Native commands require an explicit device project; central project work uses the granted home tools.',
    );
}
export function assertManagedControl(turn: ProviderTurn, control: ProviderControl): void {
  if (turn.managed_project !== undefined && LOCAL_CONTROLS.has(control.action))
    throw new ProviderInputError(
      'This native control requires an explicit device project; the managed project grant cannot acquire local file or external tool access.',
    );
}
export function permitsManagedTool(
  name: string,
  allowed: ReadonlySet<string>,
  provenance: McpServerProvenance | undefined,
): boolean {
  return (
    name.startsWith('mcp__home__') &&
    provenance?.source === 'sdk' &&
    provenance.name === 'home' &&
    allowed.has(name)
  );
}
export function managedJobOptions(turn: ProviderTurn): Options {
  return turn.managed_project === undefined
    ? {}
    : { disallowedTools: [...LOCAL_TOOLS], strictMcpConfig: true };
}
export function managedConfiguration(turn: ProviderTurn): ClaudeProviderOptions {
  if (turn.managed_project === undefined) return turn.options;
  const {
    agent: _agent,
    agents: _agents,
    plugins: _plugins,
    setting_sources: _sources,
    additional_directories: _directories,
    mcp_servers: _servers,
    ...options
  } = turn.options;
  return { ...options, builtin_tools: [], setting_sources: [] };
}

export function managedContext(turn: ProviderTurn): Record<string, JsonValue> {
  return turn.managed_project === undefined ? {} : { managed_project: turn.managed_project };
}
