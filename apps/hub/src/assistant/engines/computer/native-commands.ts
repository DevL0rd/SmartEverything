import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AI_NATIVE_COMMAND_SCOPE,
  type AI_NATIVE_COMMAND_CATALOGUE,
  AI_NATIVE_COMMAND_WRITE,
  type AiChatRow,
  type AiNativeCommandScope,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
  type AiNativeCommandDescriptor,
  type ComputerRuntimeStatus,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { ComputerRunnerDeps } from './ports';
import type { ProviderState, ComputerEvent } from './provider-state';
import {
  nativeCommandCatalogue,
  retainManualCommand,
  rejectUnknownCommand,
} from './native-command-admission';
import { currentExecutionAuthority } from '../../turn-authority';
import { canonicalRuntimeInput } from '../../../computers/runtime-receipts';
import { nativeCommandAdapter } from './native-command-adapters';
import { NativeCommandOutput } from './native-command-output';
import { assertClaudeCommandBinding } from './native-command-authority';
import { pendingCommand } from '../../../codex/provider-commands';
import { StoreNotFoundError } from '../../../store/context';
import {
  nativeCommandConfiguration,
  submitNativeCommand,
  isManualNativeCommand,
} from './native-command-configuration';
import { acceptedCommandState, rejectedCommandState } from './native-command-state';
import { background } from '@smarteverything/logging';
import { assertOwnReceipt, availableCommands, CommandReceipts } from './native-command-receipts';

export class NativeCommands {
  private readonly unsubscribe: () => void;
  private readonly recovered: Promise<void>;
  private readonly controls = new Set<string>();
  private readonly receipts: CommandReceipts;
  private readonly outputs = new Map<string, NativeCommandOutput>();
  private readonly compactions = new Set<string>();
  private readonly waiters = new Map<string, (receipt: AiNativeCommandReceipt) => void>();
  constructor(
    private readonly deps: ComputerRunnerDeps,
    private readonly state: ProviderState,
    private readonly activeTurn: (chatId: string) => boolean,
  ) {
    this.receipts = new CommandReceipts(deps.store);
    this.recovered = this.recover();
    background(this.recovered, 'native_command.recover_failed', { runtime: deps.runtime });
    this.unsubscribe = deps.directory.runtimes.onChange((status): void => {
      if (status.runtime !== deps.runtime) return;
      background(this.unavailable(status), 'native_command.unavailable_failed', {
        runtime: deps.runtime,
      });
    });
  }
  private async recover(): Promise<void> {
    const { store, runtime } = this.deps;
    await store.host.call('nativeCommandOperations', 'recover', runtime);
    for (const receipt of await store.host.call(
      'nativeCommandOperations',
      'unknownRuntime',
      runtime,
    ))
      await this.projectUnknown(receipt);
  }
  private async unavailable(status: ComputerRuntimeStatus): Promise<void> {
    await this.recovered;
    for (const receipt of await this.deps.store.host.call(
      'nativeCommandOperations',
      'activeRuntime',
      status.runtime,
    ))
      if (
        receipt.scope.device_id === status.device_id &&
        (!status.online ||
          !status.settings.settings.provider.enabled ||
          status.capabilities.provider_reason !== null)
      )
        await this.unknown(
          receipt,
          'The native runtime attachment became unavailable before command settlement.',
        );
  }
  async stop(): Promise<void> {
    this.unsubscribe();
    await this.recovered;
    for (const receipt of await this.deps.store.host.call(
      'nativeCommandOperations',
      'activeRuntime',
      this.deps.runtime,
    ))
      await this.unknown(
        receipt,
        'The command observer stopped before native settlement; this work will not be replayed.',
      );
  }
  private async unknown(receipt: AiNativeCommandReceipt, reason: string): Promise<void> {
    const saved = await this.receipts.save({
      ...receipt,
      status: 'unknown',
      outcome: null,
      text: reason,
    });
    await this.projectUnknown(saved);
    this.settled(saved);
  }
  private async projectUnknown(receipt: AiNativeCommandReceipt): Promise<void> {
    try {
      const chat = await this.deps.store.host.call('aiChats', 'chat', receipt.scope.chat_id);
      if (
        chat.engine.kind !== receipt.scope.runtime ||
        chat.engine.device_id !== receipt.scope.device_id
      )
        return;
      const current = await this.state.read(chat);
      if (current.session_id === receipt.scope.session_id)
        await this.state.save(
          chat,
          current.runtime === 'codex'
            ? { ...current, state: 'unknown', reason: receipt.text }
            : { ...current, state: 'failed', reason: receipt.text },
        );
    } catch (cause) {
      if (!(cause instanceof StoreNotFoundError)) throw cause;
    }
  }
  async scope(chat: AiChatRow, clientId: string | null): Promise<AiNativeCommandScope> {
    const state = await this.state.bound(chat);
    const target = { device_id: state.device_id, runtime: this.deps.runtime };
    const context = state.context;
    if (state.session_id === null || context === null)
      throw new ApiError('conflict', 'This runtime has no verified native command session.');
    const status = this.deps.directory.runtimeStatus(target);
    return AI_NATIVE_COMMAND_SCOPE.parse({
      version: 1,
      profile_id: chat.profile_id,
      client_id: clientId,
      chat_id: chat.id,
      ...target,
      session_id: state.session_id,
      job_id: state.job_id,
      process_generation: context.process_generation,
      cwd: context.cwd,
      connection_generation: this.deps.directory.runtimeConnectionGeneration(target),
      capability_revision: status.capabilities.capability_revision,
      catalogue_revision: nativeCommandAdapter(chat).revision(state),
    });
  }
  async list(
    chat: AiChatRow,
    clientId: string,
  ): Promise<z.infer<typeof AI_NATIVE_COMMAND_CATALOGUE>> {
    const scope = await this.scope(chat, clientId);
    await this.admit(chat, scope);
    const catalogue = await nativeCommandCatalogue(this.deps, scope);
    await this.admit(chat, scope);
    if (canonicalRuntimeInput(catalogue.scope) !== canonicalRuntimeInput(scope))
      throw new ApiError('upstream_failed', 'Command discovery returned a different native scope.');
    return catalogue;
  }
  async execute(chat: AiChatRow, raw: AiNativeCommandWrite): Promise<AiNativeCommandReceipt> {
    const input = AI_NATIVE_COMMAND_WRITE.parse(raw);
    const { store } = this.deps;
    const known = await store.host.call('nativeCommandOperations', 'known', input);
    if (known !== undefined) {
      assertOwnReceipt(chat, known, input.scope.client_id);
      return known;
    }
    await this.admit(chat, input.scope);
    await this.guard(chat);
    await store.host.call('nativeCommandOperations', 'assertJobAvailable', input);
    this.deps.directory.assertRuntimeCommandAvailable(input);
    const command = await this.selectedCommand(chat, input);
    if (isManualNativeCommand(input) && command === null)
      return rejectUnknownCommand(this.deps, input);
    await this.admit(chat, input.scope);
    const before = await this.state.bound(chat);
    const configuration = await nativeCommandConfiguration(this.deps, chat, input);
    await this.register(chat, input, command);
    const receipt = await submitNativeCommand(this.deps, this.state, input, configuration);
    assertOwnReceipt(chat, receipt, input.scope.client_id);
    const saved = await this.receipts.save(receipt);
    if (saved.status === 'rejected' && input.scope.runtime !== 'claude') {
      const recovered = rejectedCommandState(await this.state.read(chat), before, input);
      if (recovered !== null) await this.state.save(chat, recovered);
    }
    if (saved.status === 'unknown') await this.projectUnknown(saved);
    this.settled(saved);
    return saved;
  }
  private async selectedCommand(
    chat: AiChatRow,
    input: AiNativeCommandWrite,
  ): Promise<AiNativeCommandDescriptor | null> {
    if (!isManualNativeCommand(input)) return null;
    const catalogue = await this.listForCompaction(chat, input.scope.client_id);
    const matches = catalogue.commands.filter(
      (entry) => entry.definition_id === input.definition_id,
    );
    const command = matches.length === 1 ? (matches[0] ?? null) : null;
    if (input.scope.runtime === 'codex' && command?.enabled !== true) return null;
    if (command?.builtin === true && command.native_name === 'compact')
      this.compactions.add(input.operation_id);
    return command;
  }
  private async register(
    chat: AiChatRow,
    input: AiNativeCommandWrite,
    command: AiNativeCommandDescriptor | null,
  ): Promise<void> {
    const pending = pendingCommand(input);
    if (command === null)
      await this.deps.store.host.call('nativeCommandOperations', 'reserve', input, pending);
    else await retainManualCommand(this.deps, chat, { input, command });
    this.receipts.track(pending);
    if (command !== null)
      this.outputs.set(
        input.operation_id,
        await NativeCommandOutput.open(this.deps, chat, {
          input,
          failed: (reason): void => {
            background(
              this.failedOutput(input.operation_id, reason),
              'native_command.unknown_failed',
              {
                operationId: input.operation_id,
              },
            );
          },
        }),
      );
  }
  private async failedOutput(operationId: string, reason: string): Promise<void> {
    await this.unknown(
      await this.deps.store.host.call('nativeCommandOperations', 'read', operationId),
      reason,
    );
  }
  async read(chat: AiChatRow, id: string, clientId: string): Promise<AiNativeCommandReceipt> {
    const receipt = await this.deps.store.host.call('nativeCommandOperations', 'read', id);
    assertOwnReceipt(chat, receipt, clientId);
    return receipt;
  }
  async accepted(chat: AiChatRow, event: ComputerEvent): Promise<boolean> {
    const adopted = await acceptedCommandState(this.deps, await this.state.read(chat), chat, event);
    if (adopted === null) return false;
    await this.state.save(chat, adopted);
    return true;
  }
  async received(chat: AiChatRow, event: ComputerEvent): Promise<void> {
    await this.recovered;
    for (const receipt of await this.deps.store.host.call(
      'nativeCommandOperations',
      'active',
      chat.id,
    )) {
      if (receipt.command_job_id !== event.job_id) continue;
      this.outputs.get(receipt.operation_id)?.event(event);
      const saved = await this.receipts.save(
        nativeCommandAdapter(chat).observe(
          receipt,
          event,
          this.compactions.has(receipt.operation_id),
        ),
      );
      if (saved.status === 'unknown') await this.projectUnknown(saved);
      this.settled(saved);
    }
  }
  busy(chat: AiChatRow): boolean {
    return this.receipts.busy(chat.id);
  }
  async beginControl(chat: AiChatRow): Promise<() => void> {
    await this.guard(chat);
    this.controls.add(chat.id);
    return (): void => {
      this.controls.delete(chat.id);
    };
  }
  async guard(chat: AiChatRow): Promise<void> {
    await this.recovered;
    const unknown = await this.deps.store.host.call(
      'nativeCommandOperations',
      'unknownForChat',
      chat.id,
    );
    if (unknown.length !== 0)
      throw new ApiError(
        'conflict',
        'Durable native command effects are unknown; verified reconciliation is required before new work or controls.',
      );
    const state = await this.state.read(chat);
    if (state.runtime === 'codex' && state.state === 'unknown')
      throw new ApiError(
        'conflict',
        'Native effects are unknown; reconcile this conversation before new work.',
      );
    if (this.busy(chat) || this.controls.has(chat.id))
      throw new ApiError('conflict', 'Wait for native commands and controls to settle.');
  }
  async compact(chat: AiChatRow, clientId?: string): Promise<boolean> {
    const catalogue = await this.compactionCatalogue(chat, clientId);
    const selected = catalogue.commands.find(
      (command) => command.builtin && command.enabled && command.name === 'compact',
    );
    const definition = nativeCommandAdapter(chat).compactDefinition ?? selected?.definition_id;
    if (definition === undefined)
      throw new ApiError('conflict', 'This session has no available native compact command.');
    const input: AiNativeCommandWrite = {
      scope: catalogue.scope,
      operation_id: randomUUID(),
      command_job_id: randomUUID(),
      definition_id: definition,
      arguments: '',
      attachments: [],
    };
    const done = new Promise<AiNativeCommandReceipt>((resolve) => {
      this.waiters.set(input.operation_id, resolve);
    });
    try {
      this.compactions.add(input.operation_id);
      const receipt = await this.execute(chat, input);
      this.settled(receipt);
      const outcome = await done;
      if (
        outcome.status !== 'settled' ||
        outcome.outcome === 'error' ||
        outcome.outcome === 'interrupted'
      )
        throw new ApiError('conflict', outcome.text ?? 'Native compaction was not confirmed.');
      return outcome.outcome === 'compacted';
    } finally {
      this.waiters.delete(input.operation_id);
      this.compactions.delete(input.operation_id);
    }
  }
  private compactionCatalogue(
    chat: AiChatRow,
    clientId?: string,
  ): Promise<z.infer<typeof AI_NATIVE_COMMAND_CATALOGUE>> {
    const actor = clientId ?? currentExecutionAuthority()?.client_id ?? null;
    if (this.deps.runtime === 'claude' && actor === null)
      throw new ApiError('forbidden', 'Native compaction requires its genuine initiating owner.');
    return this.listForCompaction(chat, actor);
  }
  private async listForCompaction(
    chat: AiChatRow,
    clientId: string | null,
  ): Promise<z.infer<typeof AI_NATIVE_COMMAND_CATALOGUE>> {
    const scope = await this.scope(chat, clientId);
    const catalogue = await nativeCommandCatalogue(this.deps, scope);
    await this.admit(chat, scope);
    if (canonicalRuntimeInput(catalogue.scope) !== canonicalRuntimeInput(scope))
      throw new ApiError('conflict', 'This chat changed. Refresh and try again.');
    return catalogue;
  }
  private async admit(chat: AiChatRow, scope: AiNativeCommandScope): Promise<void> {
    await this.guard(chat);
    await assertClaudeCommandBinding(this.deps, this.state, chat, scope);
    if (this.activeTurn(chat.id) || this.controls.has(chat.id))
      throw new ApiError('conflict', 'Wait for the reply to finish.');
    if (
      canonicalRuntimeInput(await this.scope(chat, scope.client_id)) !==
      canonicalRuntimeInput(scope)
    )
      throw new ApiError('conflict', 'This chat changed. Refresh and try again.');
    const state = await this.state.bound(chat);
    const status = this.deps.directory.runtimeStatus({
      device_id: scope.device_id,
      runtime: scope.runtime,
    });
    if (
      !availableCommands(status) ||
      !['idle', 'completed', 'interrupted'].includes(state.state) ||
      state.prompts.some((prompt) => prompt.status === 'pending')
    )
      throw new ApiError(
        'conflict',
        'Native commands require an online idle provider with no pending questions.',
      );
    if (
      chat.engine.kind !== scope.runtime ||
      (chat.engine.settings.cwd !== undefined && chat.engine.settings.cwd !== scope.cwd)
    )
      throw new ApiError('conflict', 'The selected chat execution folder changed.');
  }
  private settled(receipt: AiNativeCommandReceipt): void {
    if (['pending', 'running'].includes(receipt.status)) return;
    this.outputs.get(receipt.operation_id)?.settle(receipt);
    this.outputs.delete(receipt.operation_id);
    this.compactions.delete(receipt.operation_id);
    this.waiters.get(receipt.operation_id)?.(receipt);
  }
}
