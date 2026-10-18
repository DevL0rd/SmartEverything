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
import { nativeCommandAdapter, NATIVE_COMMAND_ADAPTERS } from './native-command-adapters';
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

export class NativeCommands {
  private readonly unsubscribe: () => void;
  private readonly controls = new Set<string>();
  private readonly outputs = new Map<string, NativeCommandOutput>();
  private readonly compactions = new Set<string>();
  private readonly waiters = new Map<string, (receipt: AiNativeCommandReceipt) => void>();
  constructor(
    private readonly deps: ComputerRunnerDeps,
    private readonly state: ProviderState,
    private readonly activeTurn: (chatId: string) => boolean,
  ) {
    deps.store.nativeCommandOperations.recover(deps.runtime);
    for (const receipt of deps.store.nativeCommandOperations.unknownRuntime(deps.runtime))
      this.projectUnknown(receipt);
    this.unsubscribe = deps.directory.runtimes.onChange((status): void => {
      if (status.runtime !== deps.runtime) return;
      for (const receipt of deps.store.nativeCommandOperations.activeRuntime(status.runtime))
        if (
          receipt.scope.device_id === status.device_id &&
          (!status.online ||
            !status.settings.settings.provider.enabled ||
            status.capabilities.provider_reason !== null)
        )
          this.unknown(
            receipt,
            'The native runtime attachment became unavailable before command settlement.',
          );
    });
  }
  stop(): void {
    this.unsubscribe();
    for (const receipt of this.deps.store.nativeCommandOperations.activeRuntime(this.deps.runtime))
      this.unknown(
        receipt,
        'The command observer stopped before native settlement; this work will not be replayed.',
      );
  }
  private unknown(receipt: AiNativeCommandReceipt, reason: string): void {
    const saved = this.deps.store.nativeCommandOperations.save({
      ...receipt,
      status: 'unknown',
      outcome: null,
      text: reason,
    });
    this.projectUnknown(saved);
    this.settled(saved);
  }
  private projectUnknown(receipt: AiNativeCommandReceipt): void {
    try {
      const chat = this.deps.store.aiChats.chat(receipt.scope.chat_id);
      if (
        chat.engine.kind !== receipt.scope.runtime ||
        chat.engine.device_id !== receipt.scope.device_id
      )
        return;
      const current = this.state.read(chat);
      if (current.session_id === receipt.scope.session_id)
        this.state.save(
          chat,
          current.runtime === 'codex'
            ? { ...current, state: 'unknown', reason: receipt.text }
            : { ...current, state: 'failed', reason: receipt.text },
        );
    } catch (cause) {
      if (!(cause instanceof StoreNotFoundError)) throw cause;
    }
  }
  scope(chat: AiChatRow, clientId: string | null): AiNativeCommandScope {
    const state = this.state.bound(chat);
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
    const scope = this.scope(chat, clientId);
    this.admit(chat, scope);
    const catalogue = await nativeCommandCatalogue(this.deps, scope);
    this.admit(chat, scope);
    if (canonicalRuntimeInput(catalogue.scope) !== canonicalRuntimeInput(scope))
      throw new ApiError('upstream_failed', 'Command discovery returned a different native scope.');
    return catalogue;
  }
  async execute(chat: AiChatRow, raw: AiNativeCommandWrite): Promise<AiNativeCommandReceipt> {
    const input = AI_NATIVE_COMMAND_WRITE.parse(raw);
    const known = this.deps.store.nativeCommandOperations.known(input);
    if (known !== undefined) {
      this.assertReceipt(chat, known, input.scope.client_id);
      return known;
    }
    this.admit(chat, input.scope);
    this.guard(chat);
    this.deps.store.nativeCommandOperations.assertJobAvailable(input);
    this.deps.directory.assertRuntimeCommandAvailable(input);
    const command = await this.selectedCommand(chat, input);
    if (isManualNativeCommand(input) && command === null)
      return rejectUnknownCommand(this.deps, input);
    this.admit(chat, input.scope);
    const before = this.state.bound(chat);
    const configuration = nativeCommandConfiguration(this.deps, chat, input);
    this.register(chat, input, command);
    const receipt = await submitNativeCommand(this.deps, this.state, input, configuration);
    this.assertReceipt(chat, receipt, input.scope.client_id);
    const saved = this.deps.store.nativeCommandOperations.save(receipt);
    if (saved.status === 'rejected' && input.scope.runtime !== 'claude') {
      const recovered = rejectedCommandState(this.state.read(chat), before, input);
      if (recovered !== null) this.state.save(chat, recovered);
    }
    if (saved.status === 'unknown') this.projectUnknown(saved);
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
  private register(
    chat: AiChatRow,
    input: AiNativeCommandWrite,
    command: AiNativeCommandDescriptor | null,
  ): void {
    if (command === null)
      this.deps.store.nativeCommandOperations.reserve(input, pendingCommand(input));
    else retainManualCommand(this.deps, chat, { input, command });
    if (command !== null)
      this.outputs.set(
        input.operation_id,
        new NativeCommandOutput(this.deps, chat, {
          input,
          failed: (reason): void => {
            this.unknown(this.deps.store.nativeCommandOperations.read(input.operation_id), reason);
          },
        }),
      );
  }
  read(chat: AiChatRow, id: string, clientId: string): AiNativeCommandReceipt {
    const receipt = this.deps.store.nativeCommandOperations.read(id);
    this.assertReceipt(chat, receipt, clientId);
    return receipt;
  }
  accepted(chat: AiChatRow, event: ComputerEvent): boolean {
    const adopted = acceptedCommandState(this.deps, this.state.read(chat), chat, event);
    if (adopted === null) return false;
    this.state.save(chat, adopted);
    return true;
  }
  received(chat: AiChatRow, event: ComputerEvent): void {
    for (const receipt of this.deps.store.nativeCommandOperations.active(chat.id)) {
      if (receipt.command_job_id !== event.job_id) continue;
      this.outputs.get(receipt.operation_id)?.event(event);
      const saved = this.deps.store.nativeCommandOperations.save(
        nativeCommandAdapter(chat).observe(
          receipt,
          event,
          this.compactions.has(receipt.operation_id),
        ),
      );
      if (saved.status === 'unknown') this.projectUnknown(saved);
      this.settled(saved);
    }
  }
  busy(chat: AiChatRow): boolean {
    return this.deps.store.nativeCommandOperations.active(chat.id).length !== 0;
  }
  beginControl(chat: AiChatRow): () => void {
    this.guard(chat);
    this.controls.add(chat.id);
    return (): void => {
      this.controls.delete(chat.id);
    };
  }
  guard(chat: AiChatRow): void {
    const unknown = this.deps.store.nativeCommandOperations.unknownForChat(chat.id);
    if (unknown.length !== 0)
      throw new ApiError(
        'conflict',
        'Durable native command effects are unknown; verified reconciliation is required before new work or controls.',
      );
    const state = this.state.read(chat);
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
    const scope = this.scope(chat, clientId);
    const catalogue = await nativeCommandCatalogue(this.deps, scope);
    this.admit(chat, scope);
    if (canonicalRuntimeInput(catalogue.scope) !== canonicalRuntimeInput(scope))
      throw new ApiError('conflict', 'This chat changed. Refresh and try again.');
    return catalogue;
  }
  private admit(chat: AiChatRow, scope: AiNativeCommandScope): void {
    this.guard(chat);
    assertClaudeCommandBinding(this.deps, this.state, chat, scope);
    if (this.activeTurn(chat.id) || this.controls.has(chat.id))
      throw new ApiError('conflict', 'Wait for the reply to finish.');
    if (canonicalRuntimeInput(this.scope(chat, scope.client_id)) !== canonicalRuntimeInput(scope))
      throw new ApiError('conflict', 'This chat changed. Refresh and try again.');
    const state = this.state.bound(chat);
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
  private assertReceipt(
    chat: AiChatRow,
    receipt: AiNativeCommandReceipt,
    clientId: string | null,
  ): void {
    const scope = receipt.scope;
    if (
      scope.chat_id !== chat.id ||
      scope.profile_id !== chat.profile_id ||
      scope.client_id !== clientId ||
      chat.engine.kind !== scope.runtime ||
      chat.engine.device_id !== scope.device_id
    )
      throw new ApiError(
        'forbidden',
        'The native receipt belongs to another owner, client, chat or runtime.',
      );
  }
  private settled(receipt: AiNativeCommandReceipt): void {
    if (['pending', 'running'].includes(receipt.status)) return;
    this.outputs.get(receipt.operation_id)?.settle(receipt);
    this.outputs.delete(receipt.operation_id);
    this.compactions.delete(receipt.operation_id);
    this.waiters.get(receipt.operation_id)?.(receipt);
  }
}

function availableCommands(status: ComputerRuntimeStatus): boolean {
  return (
    status.online &&
    status.settings.settings.provider.enabled &&
    status.capabilities.provider_reason === null &&
    status.capabilities.operations.includes('provider_start') &&
    NATIVE_COMMAND_ADAPTERS.get(status.runtime)?.capabilities.includes(
      status.capabilities.capability_revision,
    ) === true
  );
}
