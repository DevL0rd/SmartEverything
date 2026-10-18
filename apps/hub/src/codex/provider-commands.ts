import { z } from 'zod';
import {
  AI_NATIVE_COMMAND_CATALOGUE,
  AI_NATIVE_COMMAND_RECEIPT,
  AI_NATIVE_COMMAND_SCOPE,
  AI_NATIVE_COMMAND_WRITE,
  type AiNativeCommandScope,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
  type CodexProviderEvent,
  type CodexProviderOptions,
  type ComputerRuntimeModel,
  AI_NATIVE_COMMAND_DISPATCH,
  type CodexCommandConfiguration,
  type AiNativeCommandDispatch,
} from '@smarteverything/domain';
import { canonicalRuntimeInput } from '../computers/runtime-receipts';
import type { CodexClient } from './client';
import { CodexJob } from './job';
import type { CodexAdmission } from './provider-admission';
import type { CodexSessions } from './sessions';
import { checkCommandNative } from './command-admission';
import { CodexSkillInvocation } from './skill-invocation';
import { CodexRuntimeError } from './errors';
import { codexCommandEvent } from './command-events';

import { CodexProviderSkills } from './provider-skills';
import { codexSkillDescriptor } from './skill-catalogue';
import { SKILLS_CHANGED } from './skills-protocol';
import { messageOf } from '@smarteverything/logging';
export { CODEX_COMMAND_REVISION } from './provider-skills';
export const CODEX_CAPABILITY_REVISION = 'codex-app-server-0.162.1-r2';
export const CODEX_SKILLS_CAPABILITY_REVISION = 'codex-app-server-0.162.1-skills-r3';
export const CODEX_COMPACT_DEFINITION = 'codex:rpc:thread/compact/start';
const COMPACT_REPLY = z.strictObject({});
interface Operation {
  readonly input: AiNativeCommandWrite;
  receipt: AiNativeCommandReceipt;
  readonly configuration?: CodexCommandConfiguration;
}
export interface CommandPorts {
  readonly dataDirectory: string;
  readonly models: () => Promise<readonly ComputerRuntimeModel[]>;
  readonly observedModels: () => readonly ComputerRuntimeModel[];
  readonly ordinaryAllowed: () => boolean;
  readonly cleanupFailed: (cause: unknown) => void;
  readonly deviceId: string;
  readonly admission: CodexAdmission;
  readonly sessions: CodexSessions;
  readonly job: (id: string) => CodexJob;
  readonly current: (job: CodexJob) => boolean;
  readonly configured: () => CodexProviderOptions;
  readonly retain: (job: CodexJob) => void;
  readonly publish: (event: CodexProviderEvent) => void;
  readonly now: () => string;
}
export class CodexProviderCommands {
  private readonly operations = new Map<string, Operation>();
  private readonly skills: CodexProviderSkills;
  private readonly invocation: CodexSkillInvocation;
  constructor(private readonly ports: CommandPorts) {
    this.skills = new CodexProviderSkills(ports.current);
    this.invocation = new CodexSkillInvocation({
      ...ports,
      bound: (input): CodexJob => this.bound(input.scope),
      fresh: (job): ReturnType<CodexProviderSkills['read']> => this.skills.read(job, true),
      peek: (job): ReturnType<CodexProviderSkills['peek']> => this.skills.peek(job),
      check: (job, turn): Promise<void> =>
        checkCommandNative(job, turn, ports.configured(), ports.sessions),
      save: (operation, receipt): void => {
        this.update(operation, receipt);
      },
      create: (previous, turn, operation, cleanup): CodexJob =>
        this.create(previous, turn, operation, cleanup),
    });
  }
  revision(): string {
    return this.skills.revision;
  }
  retain(job: CodexJob): void {
    this.skills.retain(job);
  }
  clientClosed(client: CodexClient): void {
    this.invocation.clientClosed(client);
  }
  stop(): void {
    this.invocation.stop();
    this.invalidate();
  }
  invalidate(): void {
    this.skills.invalidate();
  }
  changed(raw: unknown, jobs: readonly CodexJob[]): void {
    SKILLS_CHANGED.parse(raw);
    this.invalidate();
    for (const job of jobs) if (this.ports.current(job)) this.context(job);
  }
  private context(job: CodexJob): void {
    job.emit({
      kind: 'context',
      context: {
        device_id: job.turn.device_id,
        runtime: 'codex',
        session_id: job.threadId,
        process_generation: job.generation,
        cwd: job.cwd,
        workspace_roots: [job.cwd, ...job.roots],
      },
    });
  }
  async catalogue(raw: AiNativeCommandScope): Promise<z.infer<typeof AI_NATIVE_COMMAND_CATALOGUE>> {
    const scope = AI_NATIVE_COMMAND_SCOPE.parse(raw);
    const job = this.bound(scope);
    const entry = await this.skills.read(job);
    this.bound(scope);
    return AI_NATIVE_COMMAND_CATALOGUE.parse({
      scope,
      diagnostics: entry.errors,
      commands: [
        {
          definition_id: CODEX_COMPACT_DEFINITION,
          name: 'compact',
          description: 'Compact the current owned Codex thread using native context compaction.',
          aliases: [],
          builtin: true,
          source: 'builtin',
          native_name: 'thread/compact/start',
          path: null,
          enabled: true,
          argument_hint: null,
          arguments: false,
          attachments: false,
          unavailable_reason: null,
        },
        ...skillDescriptors(
          entry.skills,
          scope.capability_revision === CODEX_SKILLS_CAPABILITY_REVISION,
        ),
      ],
    });
  }
  read(scope: AiNativeCommandScope, id: string): AiNativeCommandReceipt {
    const operation = this.operations.get(id);
    if (
      operation === undefined ||
      canonicalRuntimeInput(scope) !== canonicalRuntimeInput(operation.input.scope)
    )
      throw new CodexRuntimeError(
        'provider_command_receipt',
        'This receipt has a different native command owner or binding.',
      );
    return operation.receipt;
  }
  async execute(
    raw: AiNativeCommandWrite,
    configuration?: CodexCommandConfiguration,
  ): Promise<AiNativeCommandReceipt> {
    const input = AI_NATIVE_COMMAND_WRITE.parse(raw);
    const existing = this.operations.get(input.operation_id);
    if (existing !== undefined) {
      if (
        commandIdentity(existing.input, existing.configuration) !==
        commandIdentity(input, configuration)
      )
        throw new CodexRuntimeError(
          'provider_command',
          'This command receipt identifies different input.',
        );
      return existing.receipt;
    }
    if (this.operations.size >= 10_000)
      throw new CodexRuntimeError(
        'provider_command',
        'Native command receipt capacity was reached.',
      );
    const operation: Operation = {
      input,
      receipt: pendingCommand(input),
      ...(configuration === undefined ? {} : { configuration }),
    };
    this.operations.set(input.operation_id, operation);
    if (input.definition_id === CODEX_COMPACT_DEFINITION && configuration === undefined)
      await this.submit(operation);
    else if (configuration !== undefined && validSkillPreparation(input))
      await this.invocation.prepare(operation, configuration);
    else
      operation.receipt = {
        ...operation.receipt,
        status: 'rejected',
        text: 'This native operation requires its negotiated skill revision, current configuration and a fresh logical job.',
      };
    return operation.receipt;
  }
  async dispatch(raw: AiNativeCommandDispatch): Promise<AiNativeCommandReceipt> {
    const decision = AI_NATIVE_COMMAND_DISPATCH.parse(raw);
    const operation = this.operations.get(decision.operation_id);
    if (
      operation === undefined ||
      canonicalRuntimeInput(operation.input.scope) !== canonicalRuntimeInput(decision.scope)
    )
      throw new CodexRuntimeError(
        'provider_command',
        'Dispatch names another prepared native operation.',
      );
    return this.invocation.dispatch(operation, decision);
  }
  private update(
    operation: { readonly input: AiNativeCommandWrite },
    receipt: AiNativeCommandReceipt,
  ): void {
    const owned = this.operations.get(operation.input.operation_id);
    if (owned === undefined)
      throw new CodexRuntimeError('provider_command', 'The command operation is not registered.');
    owned.receipt = receipt;
  }
  private async submit(operation: Operation): Promise<void> {
    let job: CodexJob | null = null;
    let reserved = false;
    let submitted = false;
    try {
      const previous = this.admit(operation.input);
      const turn = {
        ...previous.turn,
        job_id: operation.input.command_job_id,
        session_id: previous.threadId,
      };
      this.ports.admission.reserve(turn);
      reserved = true;
      await this.checkNative(previous, operation.input.scope);
      job = this.create(previous, turn, operation);
      this.ports.retain(job);
      job.accepted();
      this.bound(operation.input.scope);
      submitted = true;
      COMPACT_REPLY.parse(
        await job.client.request('thread/compact/start', { threadId: job.threadId }),
      );
    } catch (cause) {
      const text = messageOf(cause).slice(0, 2000);
      if (submitted && job !== null) {
        if (cause instanceof CodexRuntimeError && !cause.uncertain) job.rejected(text);
        else job.lost(text);
      } else {
        if (job !== null) job.rejected(text);
        this.update(operation, { ...operation.receipt, status: 'rejected', text });
      }
    } finally {
      if (reserved) this.ports.admission.release(operation.input.scope.chat_id);
    }
  }
  private admit(input: AiNativeCommandWrite): CodexJob {
    if (
      input.definition_id !== CODEX_COMPACT_DEFINITION ||
      input.arguments.length !== 0 ||
      input.attachments.length !== 0
    )
      throw new CodexRuntimeError(
        'provider_command',
        'Codex compact requires its advertised definition and accepts no arguments or attachments.',
      );
    if (input.command_job_id === input.scope.job_id)
      throw new CodexRuntimeError('provider_command', 'Compaction requires a new owned job ID.');
    const previous = this.bound(input.scope);
    if (
      this.ports.admission.busy(previous.turn.chat_id) ||
      previous.prompts.list().length !== 0 ||
      previous.agents
        .list()
        .some((run) => !['completed', 'stopped', 'interrupted', 'failed'].includes(run.state))
    )
      throw new CodexRuntimeError(
        'provider_command',
        'Wait for active native work, questions, children and controls before compacting.',
      );
    return previous;
  }
  private bound(scope: AiNativeCommandScope): CodexJob {
    const job = this.ports.job(scope.job_id);
    const expected = [
      'codex',
      this.ports.deviceId,
      job.turn.profile_id,
      job.turn.chat_id,
      job.threadId,
      job.generation,
      job.cwd,
      this.revision(),
      scope.capability_revision,
    ];
    const actual = [
      scope.runtime,
      scope.device_id,
      scope.profile_id,
      scope.chat_id,
      scope.session_id,
      scope.process_generation,
      scope.cwd,
      scope.catalogue_revision,
      scope.capability_revision,
    ];
    if (
      canonicalRuntimeInput(expected) !== canonicalRuntimeInput(actual) ||
      !this.ports.current(job) ||
      ![CODEX_CAPABILITY_REVISION, CODEX_SKILLS_CAPABILITY_REVISION].includes(
        scope.capability_revision,
      )
    )
      throw new CodexRuntimeError(
        'provider_commands',
        'The native command scope is stale or names another owner, session, runtime, folder or process.',
      );
    return job;
  }
  private async checkNative(job: CodexJob, scope: AiNativeCommandScope): Promise<void> {
    await checkCommandNative(job, job.turn, this.ports.configured(), this.ports.sessions);
    this.bound(scope);
  }
  private create(
    previous: CodexJob,
    turn: CodexJob['turn'],
    operation: { readonly input: AiNativeCommandWrite; receipt: AiNativeCommandReceipt },
    cleanup: () => void = (): void => undefined,
  ): CodexJob {
    const job = new CodexJob({
      turn,
      client: previous.client,
      threadId: previous.threadId,
      cwd: previous.cwd,
      roots: previous.roots,
      generation: previous.generation,
      now: this.ports.now,
      cleanup,
      command: true,
      publish: (event): void => {
        this.update(
          operation,
          codexCommandEvent(
            operation.receipt,
            event,
            operation.input.definition_id === CODEX_COMPACT_DEFINITION,
          ),
        );
        this.ports.publish(event);
      },
    });
    job.usage = previous.usage;
    return job;
  }
}
export function pendingCommand(input: AiNativeCommandWrite): AiNativeCommandReceipt {
  return AI_NATIVE_COMMAND_RECEIPT.parse({
    operation_id: input.operation_id,
    scope: input.scope,
    command_job_id: input.command_job_id,
    definition_id: input.definition_id,
    status: 'pending',
    outcome: null,
    text: null,
    turn_id: null,
    completed_item_id: null,
    source_event_seq: null,
  });
}

function skillDescriptors(
  skills: Parameters<typeof codexSkillDescriptor>[0][],
  invocation: boolean,
): ReturnType<typeof codexSkillDescriptor>[] {
  const commands = skills.map((skill) => codexSkillDescriptor(skill, invocation));
  const counts = new Map<string, number>();
  for (const command of commands)
    counts.set(command.definition_id, (counts.get(command.definition_id) ?? 0) + 1);
  return commands.map((command) =>
    counts.get(command.definition_id) === 1
      ? command
      : {
          ...command,
          enabled: false,
          unavailable_reason: 'This native skill identity is duplicated.',
        },
  );
}

function validSkillPreparation(input: AiNativeCommandWrite): boolean {
  return (
    input.scope.capability_revision === CODEX_SKILLS_CAPABILITY_REVISION &&
    input.command_job_id !== input.scope.job_id &&
    input.definition_id !== CODEX_COMPACT_DEFINITION
  );
}

function commandIdentity(
  input: AiNativeCommandWrite,
  configuration: CodexCommandConfiguration | undefined,
): string {
  return canonicalRuntimeInput([input, configuration ?? null]);
}
