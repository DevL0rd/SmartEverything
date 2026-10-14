import { createHash } from 'node:crypto';
import {
  AI_NATIVE_COMMAND_CATALOGUE,
  AI_NATIVE_COMMAND_SCOPE,
  AI_NATIVE_COMMAND_WRITE,
  AI_NATIVE_COMMAND_DISPATCH,
  type AiNativeCommandDispatch,
  type AiNativeCommandScope,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
  type ProviderEvent,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { ProviderJob } from './job';
import type { ProviderReceipts } from './receipts';
import { ProviderInputError } from './input';
import { CLAUDE_COMMAND_CAPABILITY_REVISION } from './command-catalogue';
import { claudeCommandEvent } from './command-events';
import { pendingCommand } from '../../codex/provider-commands';
import { canonicalRuntimeInput } from '../../computers/runtime-receipts';
import { requireSubscription } from './job-state';
import { ClaudeSubscriptionBillingError } from './billing';
interface Operation {
  readonly input: AiNativeCommandWrite;
  compact: boolean;
  receipt: AiNativeCommandReceipt;
}
interface CommandPorts {
  readonly deviceId: string;
  readonly receipts: ProviderReceipts;
  readonly job: (id: string) => ProviderJob;
  readonly current: (job: ProviderJob) => boolean;
  readonly check: (job: ProviderJob) => Promise<void>;
  readonly retain: (previousId: string, jobId: string, job: ProviderJob) => void;
  readonly reserve: (job: ProviderJob) => () => void;
}
export class ClaudeProviderCommands {
  private readonly operations = new Map<string, Operation>();
  private readonly active = new Map<string, Operation>();
  constructor(private readonly ports: CommandPorts) {}
  async catalogue(raw: AiNativeCommandScope): Promise<z.infer<typeof AI_NATIVE_COMMAND_CATALOGUE>> {
    const scope = AI_NATIVE_COMMAND_SCOPE.parse(raw);
    const job = this.bound(scope);
    await job.commands.refresh(job.query);
    this.bound(scope);
    return AI_NATIVE_COMMAND_CATALOGUE.parse({ scope, commands: job.commands.descriptors() });
  }
  read(scope: AiNativeCommandScope, id: string): AiNativeCommandReceipt {
    const operation = this.operations.get(id);
    if (
      operation === undefined ||
      canonicalRuntimeInput(scope) !== canonicalRuntimeInput(operation.input.scope)
    )
      throw new ProviderInputError('This command receipt names a different native binding.');
    return operation.receipt;
  }
  async execute(raw: AiNativeCommandWrite): Promise<AiNativeCommandReceipt> {
    const input = AI_NATIVE_COMMAND_WRITE.parse(raw);
    const known = this.operations.get(input.operation_id);
    if (known !== undefined) {
      if (canonicalRuntimeInput(known.input) !== canonicalRuntimeInput(input))
        throw new ProviderInputError('This command operation ID was reused with different input.');
      return known.receipt;
    }
    if (this.operations.size >= 10_000)
      throw new ProviderInputError('Native command receipt capacity was reached.');
    const operation = { input, compact: false, receipt: pendingCommand(input) };
    this.operations.set(input.operation_id, operation);
    await this.submit(operation);
    return operation.receipt;
  }
  event(event: ProviderEvent): void {
    const operation = this.active.get(event.job_id);
    if (operation === undefined) return;
    operation.receipt = claudeCommandEvent(operation.receipt, event, operation.compact);
    if (!['pending', 'running'].includes(operation.receipt.status))
      this.active.delete(event.job_id);
  }
  private async submit(operation: Operation): Promise<void> {
    let release: (() => void) | null = null;
    try {
      const job = this.bound(operation.input.scope);
      release = this.ports.reserve(job);
      await this.ports.check(job);
      requireSubscription(await job.query.accountInfo());
      await job.commands.refresh(job.query);
      this.bound(operation.input.scope);
      const selected = job.commands.select(operation.input.definition_id, job.commands.revision);
      this.validateInput(operation.input, selected.arguments, selected.attachments);
      const signature = createHash('sha256')
        .update(canonicalRuntimeInput(operation.input))
        .digest('hex');
      if (
        (await this.ports.receipts.admit({
          job_id: operation.input.command_job_id,
          signature,
          session_id: job.session,
        })) !== null
      )
        throw new ProviderInputError(
          'This command job was admitted before; its unknown process effect will never be replayed.',
        );
      this.bound(operation.input.scope);
      job.commands.select(operation.input.definition_id, job.commands.revision);
      const owned = this.registered(operation);
      owned.compact = selected.builtin && selected.native_name === 'compact';
    } catch (cause) {
      this.active.delete(operation.input.command_job_id);
      const owned = this.registered(operation);
      owned.receipt = {
        ...owned.receipt,
        status: 'rejected',
        text:
          cause instanceof Error
            ? cause.message.slice(0, 2000)
            : 'The native command was not admitted.',
      };
    } finally {
      release?.();
    }
  }
  async dispatch(raw: AiNativeCommandDispatch): Promise<AiNativeCommandReceipt> {
    const input = AI_NATIVE_COMMAND_DISPATCH.parse(raw);
    const operation = this.operations.get(input.operation_id);
    if (
      operation === undefined ||
      canonicalRuntimeInput(input.scope) !== canonicalRuntimeInput(operation.input.scope)
    )
      throw new ProviderInputError('Native dispatch names another prepared command binding.');
    if (operation.receipt.status !== 'pending') return operation.receipt;
    if (!input.permit) {
      operation.receipt = {
        ...operation.receipt,
        status: 'rejected',
        text: input.reason ?? 'The initiating authority was revoked before dispatch.',
      };
      return operation.receipt;
    }
    return this.dispatchPrepared(operation);
  }
  private async dispatchPrepared(operation: Operation): Promise<AiNativeCommandReceipt> {
    let release: (() => void) | null = null;
    let attempted = false;
    try {
      const job = this.bound(operation.input.scope);
      release = this.ports.reserve(job);
      const selected = job.commands.select(operation.input.definition_id, job.commands.revision);
      this.active.set(operation.input.command_job_id, operation);
      attempted = true;
      await job.command(
        operation.input.command_job_id,
        selected.native_name,
        operation.input.arguments,
      );
      this.ports.retain(operation.input.scope.job_id, operation.input.command_job_id, job);
    } catch (cause) {
      this.active.delete(operation.input.command_job_id);
      const owned = this.registered(operation);
      owned.receipt = {
        ...owned.receipt,
        status:
          attempted && !(cause instanceof ClaudeSubscriptionBillingError) ? 'unknown' : 'rejected',
        text:
          cause instanceof Error
            ? cause.message.slice(0, 2000)
            : 'Native dispatch was not confirmed.',
      };
    } finally {
      release?.();
    }
    return operation.receipt;
  }
  private registered(operation: Operation): Operation {
    const owned = this.operations.get(operation.input.operation_id);
    if (owned === undefined) throw new ProviderInputError('The command operation is unregistered.');
    return owned;
  }
  private validateInput(
    input: AiNativeCommandWrite,
    argumentsAllowed: boolean,
    attachmentsAllowed: boolean,
  ): void {
    if (
      input.command_job_id === input.scope.job_id ||
      (!argumentsAllowed && input.arguments !== '') ||
      (!attachmentsAllowed && input.attachments.length !== 0)
    )
      throw new ProviderInputError(
        'Native commands require a fresh operation job and the advertised argument/attachment support.',
      );
  }
  private bound(scope: AiNativeCommandScope): ProviderJob {
    const job = this.ports.job(scope.job_id);
    if (
      canonicalRuntimeInput([
        scope.runtime,
        scope.device_id,
        scope.profile_id,
        scope.chat_id,
        scope.session_id,
        scope.process_generation,
        scope.cwd,
        scope.capability_revision,
        scope.catalogue_revision,
      ]) !==
        canonicalRuntimeInput([
          'claude',
          this.ports.deviceId,
          job.options.turn.profile_id,
          job.options.turn.chat_id,
          job.session,
          job.source.generation,
          job.options.cwd,
          CLAUDE_COMMAND_CAPABILITY_REVISION,
          job.commandRevision,
        ]) ||
      !this.ports.current(job)
    )
      throw new ProviderInputError(
        'The native command catalogue, owner, session, folder, model, options or process changed.',
      );
    if (job.active || !job.open || !job.inputReady)
      throw new ProviderInputError('Wait for an idle open owned native Query before commands.');
    return job;
  }
}
