import {
  ApiError,
  AI_NATIVE_COMMAND_CATALOGUE,
  COMPUTER_RUNTIME_REPLY,
  type AiChatRow,
  type AiNativeCommandScope,
  type AiNativeCommandWrite,
  type AiNativeCommandReceipt,
  type AiNativeCommandDescriptor,
} from '@smarteverything/domain';
import { effectiveClientById } from '../../../server/person-access';
import type { z } from 'zod';
import type { ComputerRunnerDeps } from './ports';
import type { ProviderState } from './provider-state';
import { pendingCommand } from '../../../codex/provider-commands';
import { eventAuthority } from '../../turn-authority';
import { nativeCommandAdapter } from './native-command-adapters';
import {
  commandAuthority,
  manualCommandCaller,
  assertClaudeCommandBinding,
} from './native-command-authority';
export async function nativeCommandCatalogue(
  deps: ComputerRunnerDeps,
  scope: AiNativeCommandScope,
): Promise<z.infer<typeof AI_NATIVE_COMMAND_CATALOGUE>> {
  const request =
    scope.runtime === 'claude'
      ? { runtime: 'claude' as const, request: { operation: 'provider_commands' as const, scope } }
      : { runtime: 'codex' as const, request: { operation: 'provider_commands' as const, scope } };
  const reply = await deps.directory.requestRuntime(
    { device_id: scope.device_id, runtime: scope.runtime },
    request,
    COMPUTER_RUNTIME_REPLY,
  );
  if (reply.reply.operation !== 'provider_commands')
    throw new ApiError('upstream_failed', 'Native command discovery returned another operation.');
  return AI_NATIVE_COMMAND_CATALOGUE.parse(reply.reply.value);
}
export function retainManualCommand(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  invocation: { readonly input: AiNativeCommandWrite; readonly command: AiNativeCommandDescriptor },
): void {
  const { input, command } = invocation;
  commandAuthority(deps, chat, input.scope);
  const client =
    input.scope.client_id === null
      ? undefined
      : effectiveClientById(deps.store, input.scope.client_id);
  if (client === undefined)
    throw new ApiError('forbidden', 'A native manual command needs its genuine initiating client.');
  const text = `/${command.native_name}${input.arguments === '' ? '' : ` ${input.arguments}`}`;
  deps.store.durableWrite(() => {
    const message = deps.conversation.person({
      chat,
      clientId: client.id,
      author: client.name,
      text,
      files: [],
      clientMessageId: input.operation_id,
      origin: { source: 'chat', plugin_id: null, device_id: input.scope.device_id, name: null },
    });
    const event = deps.store.assistantEvents.add({
      id: input.operation_id,
      kind: 'chat',
      chat_id: chat.id,
      message_id: message.id,
      profile_id: chat.profile_id,
      client_id: client.id,
      text,
    });
    deps.store.assistantEvents.mark(event.id, 'delivered_at');
    eventAuthority(deps.store, event);
    manualCommandCaller(deps, chat, input);
    deps.store.nativeCommandOperations.reserve(input, pendingCommand(input));
    deps.conversation.stateOf(message.id, 'working');
  });
}
export function rejectUnknownCommand(
  deps: ComputerRunnerDeps,
  input: AiNativeCommandWrite,
): AiNativeCommandReceipt {
  const receipt = {
    ...pendingCommand(input),
    status: 'rejected' as const,
    text: 'The selected native command definition is unknown.',
  };
  deps.store.nativeCommandOperations.reserve(input, receipt);
  return receipt;
}
export function authorizeNativeDispatch(
  deps: ComputerRunnerDeps,
  state: ProviderState,
  input: AiNativeCommandWrite,
): void {
  const chat = deps.store.aiChats.chat(input.scope.chat_id);
  manualCommandCaller(deps, chat, input);
  assertClaudeCommandBinding(deps, state, chat, input.scope);
  const current = state.bound(chat);
  assertPreparedBinding(current, input, chat);
  assertPendingCommand(deps, current, input);
  assertCommandAttachment(deps, input);
}
function assertPreparedBinding(
  current: ReturnType<ProviderState['bound']>,
  input: AiNativeCommandWrite,
  chat: AiChatRow,
): void {
  const context = current.context;
  if (
    current.job_id !== input.scope.job_id ||
    current.session_id !== input.scope.session_id ||
    current.device_id !== input.scope.device_id ||
    context?.process_generation !== input.scope.process_generation ||
    context.cwd !== input.scope.cwd
  )
    throw new ApiError('conflict', 'The prepared native command binding changed.');
  if (
    nativeCommandAdapter(chat).revision(current) !== input.scope.catalogue_revision ||
    !['idle', 'completed', 'interrupted'].includes(current.state)
  )
    throw new ApiError('conflict', 'The native source catalogue or state changed before dispatch.');
}
function assertPendingCommand(
  deps: ComputerRunnerDeps,
  current: ReturnType<ProviderState['bound']>,
  input: AiNativeCommandWrite,
): void {
  const receipt = deps.store.nativeCommandOperations.known(input);
  if (
    receipt?.status !== 'pending' ||
    current.prompts.some((prompt) => prompt.status === 'pending') ||
    deps.store.nativeCommandOperations.unknownForChat(input.scope.chat_id).length !== 0
  )
    throw new ApiError('conflict', 'The exact native command is no longer awaiting dispatch.');
}
function assertCommandAttachment(deps: ComputerRunnerDeps, input: AiNativeCommandWrite): void {
  const target = { device_id: input.scope.device_id, runtime: input.scope.runtime };
  const status = deps.directory.runtimeStatus(target);
  if (
    !status.online ||
    !status.settings.settings.provider.enabled ||
    status.capabilities.provider_reason !== null ||
    status.capabilities.capability_revision !== input.scope.capability_revision ||
    deps.directory.runtimeConnectionGeneration(target) !== input.scope.connection_generation
  )
    throw new ApiError('conflict', 'The prepared native command attachment or capability changed.');
}
