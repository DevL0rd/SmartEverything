import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import { managedPluginAgentNames } from '../composition/managed-plugin-registry';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { HarnessRuntimeError } from './errors';
import { CHAT_FOLDER_TOOLS, chatFolderRefusal } from './chat-folder';

export const HARNESS_AUTHORITY = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('manual'), profileId: z.uuid() }),
  z.strictObject({ kind: z.literal('trigger'), profileId: z.uuid(), grantId: z.uuid() }),
]);
export type HarnessAuthority = z.infer<typeof HARNESS_AUTHORITY>;

export interface HarnessServerToolAccess {
  hubToolNames(authority: HarnessAuthority): readonly string[];
  nativeAccess?(id: string): boolean;
  deny(authority: HarnessAuthority, execution: Readonly<ToolExecution>): string | undefined;
}

const LOCAL_SYSTEM_TOOLS = new Set([
  'read',
  'write',
  'edit',
  'glob',
  'grep',
  'read_image',
  'bash',
  'pwsh',
  'job_output',
  'job_list',
  'job_kill',
  'set_working_directory',
]);
const CONVERSATION_TOOLS = [
  'ask_user_question',
  'skill',
  'web_fetch',
  'todo_write',
  'exit_plan_mode',
];

export class HarnessServerPolicy {
  private readonly authorities = new Map<string, HarnessAuthority>();

  constructor(
    private readonly server: boolean,
    private readonly access: HarnessServerToolAccess | undefined,
    private readonly ctx: Context,
  ) {}

  bind(id: string, authority?: HarnessAuthority): void {
    if (!this.server) return;
    if (authority === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Server sessions require the initiating profile and explicit manual/trigger authority.',
        id,
      );
    this.authorities.set(id, HARNESS_AUTHORITY.parse(authority));
  }

  unbind(id: string): void {
    this.authorities.delete(id);
  }

  nativeAvailable(id: string): boolean {
    if (!this.server) return true;
    return this.authorities.has(id) && this.nativeAccess(id);
  }

  requireNative(id: string): void {
    if (!this.nativeAvailable(id))
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'Machine tools on the home computer are for its owner.',
        id,
      );
  }

  allowed(id: string): readonly string[] | undefined {
    if (!this.server) return undefined;
    const authority = this.authorities.get(id);
    if (authority === undefined)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Server session authority is unavailable.',
        id,
      );
    const names = this.access?.hubToolNames(authority) ?? [];
    return [
      ...CONVERSATION_TOOLS,
      ...this.ctx.tools
        .schemas()
        .map((tool) => tool.name)
        .filter((name) => this.fileTool(id, name) && !names.includes(name)),
      ...managedPluginAgentNames(this.ctx),
      ...names,
    ];
  }

  private fileTool(id: string, name: string): boolean {
    return this.nativeAccess(id) ? localSystemTool(name) : CHAT_FOLDER_TOOLS.has(name);
  }
  private nativeAccess(id: string): boolean {
    return this.access?.nativeAccess?.(id) === true;
  }
  guard(execution: Readonly<ToolExecution>): string | undefined {
    if (!this.server) return undefined;
    const agent = execution.agent;
    if (agent === undefined)
      return 'Server tools require an owned conversation and initiating profile.';
    const authority = this.authorities.get(agent.id);
    if (authority === undefined) return 'Server session authority is unavailable.';
    if (CONVERSATION_TOOLS.includes(execution.name)) return undefined;
    if (localSystemTool(execution.name) && !this.hubTool(authority, execution.name))
      return this.localRefusal(agent, execution);
    return this.hubRefusal(authority, execution);
  }
  private localRefusal(
    agent: NonNullable<ToolExecution['agent']>,
    execution: Readonly<ToolExecution>,
  ): string | undefined {
    if (this.nativeAccess(agent.id)) return undefined;
    if (!CHAT_FOLDER_TOOLS.has(execution.name))
      return 'Machine tools on the home computer are for its owner.';
    const args = z.record(z.string(), z.unknown()).parse(execution.arguments);
    return chatFolderRefusal(execution.name, args, this.ctx.workingDirectory.get(agent.session));
  }
  private hubTool(authority: HarnessAuthority, name: string): boolean {
    return this.access?.hubToolNames(authority).includes(name) === true;
  }
  private hubRefusal(
    authority: HarnessAuthority,
    execution: Readonly<ToolExecution>,
  ): string | undefined {
    const access = this.access;
    if (managedPluginAgentNames(this.ctx).includes(execution.name))
      return access?.hubToolNames(authority).includes('subagent_run') === true
        ? undefined
        : 'This initiating grant does not expose helper execution.';
    if (access === undefined || !this.hubTool(authority, execution.name))
      return 'This initiating profile or trigger grant does not expose the requested hub tool.';
    return access.deny(authority, execution);
  }
}

function localSystemTool(name: string): boolean {
  return LOCAL_SYSTEM_TOOLS.has(name) || name.startsWith('codegraph');
}
