import { z } from 'zod';
import type { Context } from '@deepseek-ai/cordis';
import {
  managedPluginAgentNames,
  isManagedPluginSkillRequest,
} from '../composition/managed-plugin-registry';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { HarnessRuntimeError } from './errors';
import { isProductSkillRequest } from '../composition/product-skills';

export const HARNESS_AUTHORITY = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('manual'), profileId: z.uuid() }),
  z.strictObject({ kind: z.literal('trigger'), profileId: z.uuid(), grantId: z.uuid() }),
]);
export type HarnessAuthority = z.infer<typeof HARNESS_AUTHORITY>;

export interface HarnessServerToolAccess {
  hubToolNames(authority: HarnessAuthority): readonly string[];
  deny(authority: HarnessAuthority, execution: Readonly<ToolExecution>): string | undefined;
}

const LOCAL_SYSTEM_TOOLS = new Set([
  'read',
  'write',
  'edit',
  'read_image',
  'bash',
  'pwsh',
  'job_output',
  'job_list',
  'job_kill',
]);
const CONVERSATION_TOOLS = ['ask_user_question', 'skill'];
const MANAGED_FILE_TOOLS = ['read', 'write', 'edit', 'read_image'];

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
    if (names.some((name) => LOCAL_SYSTEM_TOOLS.has(name)))
      throw new HarnessRuntimeError(
        'capability_unsupported',
        'Hub tool registry attempted to expose a server-local system tool.',
        id,
      );
    return [
      ...CONVERSATION_TOOLS,
      ...MANAGED_FILE_TOOLS,
      ...managedPluginAgentNames(this.ctx),
      ...names,
    ];
  }

  private conversationRefusal(execution: Readonly<ToolExecution>): string | undefined {
    if (execution.name !== 'skill' || isManagedPluginSkillRequest(this.ctx, execution.arguments))
      return undefined;
    return skillRefusal(execution.arguments);
  }
  private helperRefusal(
    authority: HarnessAuthority,
    execution: Readonly<ToolExecution>,
  ): string | undefined {
    return this.access === undefined
      ? 'Durable helper access is unavailable.'
      : this.access.deny(authority, {
          ...execution,
          name: 'subagent_run',
          arguments: {
            task: z.object({ prompt: z.string() }).parse(execution.arguments).prompt,
            wait: false,
            timeoutSeconds: 300,
          },
        });
  }
  guard(execution: Readonly<ToolExecution>): string | undefined {
    if (!this.server) return undefined;
    if (localSystemTool(execution.name))
      return 'Server-local file, shell and system tools are never available.';
    const agent = execution.agent;
    if (agent === undefined)
      return 'Server tools require an owned conversation and initiating profile.';
    const authority = this.authorities.get(agent.id);
    if (authority === undefined) return 'Server session authority is unavailable.';
    if (MANAGED_FILE_TOOLS.includes(execution.name) || CONVERSATION_TOOLS.includes(execution.name))
      return this.conversationRefusal(execution);
    const access = this.access;
    if (managedPluginAgentNames(this.ctx).includes(execution.name))
      return this.helperRefusal(authority, execution);
    if (access?.hubToolNames(authority).includes(execution.name) !== true)
      return 'This initiating profile or trigger grant does not expose the requested hub tool.';
    return access.deny(authority, execution);
  }
}

function localSystemTool(name: string): boolean {
  return LOCAL_SYSTEM_TOOLS.has(name) && !MANAGED_FILE_TOOLS.includes(name);
}

function skillRefusal(args: unknown): string | undefined {
  return isProductSkillRequest(args)
    ? undefined
    : 'Server conversations may load only embedded SmartEverything product skills.';
}
