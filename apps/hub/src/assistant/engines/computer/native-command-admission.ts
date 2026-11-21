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
import { effectiveClientOf } from '../../../server/person-access';
import type { z } from 'zod';
import type { ComputerRunnerDeps } from './ports';
import type { ProviderState } from './provider-state';
import { pendingCommand } from '../../../codex/provider-commands';
import { authorityScope } from '../../turn-authority';
import { nativeCommandAdapter } from './native-command-adapters';
import {
  assertManualBinding,
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
export async function retainManualCommand(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  invocation: { readonly input: AiNativeCommandWrite; readonly command: AiNativeCommandDescriptor },
): Promise<void> {
  const { input, command } = invocation;
  await commandAuthority(deps, chat, input.scope);
  assertManualBinding(chat, input);
  const client =
    input.scope.client_id === null
      ? undefined
      : await effectiveClientOf(deps.store, input.scope.client_id);
  if (client === undefined)
    throw new ApiError('forbidden', 'A native manual command needs its genuine initiating client.');
  await deps.store.host.write('nativeManualCommandRetain', {
    chat,
    client: { id: client.id, name: client.name },
    text: `/${command.native_name}${input.arguments === '' ? '' : ` ${input.arguments}`}`,
    input,
    receipt: pendingCommand(input),
    held: deps.store.live.chatWork.holds.held(),
    scope: authorityScope(),
    localDevice: deps.store.live.computers.isLocal(input.scope.device_id)
      ? input.scope.device_id
      : null,
  });
}
export async function rejectUnknownCommand(
  deps: ComputerRunnerDeps,
  input: AiNativeCommandWrite,
): Promise<AiNativeCommandReceipt> {
  const receipt = {
    ...pendingCommand(input),
    status: 'rejected' as const,
    text: 'The selected native command definition is unknown.',
  };
  await deps.store.host.call('nativeCommandOperations', 'reserve', input, receipt);
  return receipt;
}
export async function authorizeNativeDispatch(
  deps: ComputerRunnerDeps,
  state: ProviderState,
  input: AiNativeCommandWrite,
): Promise<void> {
  const chat = await deps.store.host.call('aiChats', 'chat', input.scope.chat_id);
  await manualCommandCaller(deps, chat, input);
  await assertClaudeCommandBinding(deps, state, chat, input.scope);
  const current = await state.bound(chat);
  assertPreparedBinding(current, input, chat);
  await assertPendingCommand(deps, current, input);
  assertCommandAttachment(deps, input);
}
type BoundState = Awaited<ReturnType<ProviderState['bound']>>;
function assertPreparedBinding(
  current: BoundState,
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
async function assertPendingCommand(
  deps: ComputerRunnerDeps,
  current: BoundState,
  input: AiNativeCommandWrite,
): Promise<void> {
  const receipt = await deps.store.host.call('nativeCommandOperations', 'known', input);
  if (
    receipt?.status !== 'pending' ||
    current.prompts.some((prompt) => prompt.status === 'pending') ||
    (await deps.store.host.call('nativeCommandOperations', 'unknownForChat', input.scope.chat_id))
      .length !== 0
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
