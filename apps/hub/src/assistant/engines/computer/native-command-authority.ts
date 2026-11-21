import {
  ApiError,
  CLAUDE_PROVIDER_OPTIONS,
  type AiChatRow,
  type AiNativeCommandScope,
  type AiNativeCommandWrite,
} from '@smarteverything/domain';
import { effectiveClientOf } from '../../../server/person-access';
import { effectiveToolsOf } from '../../tool-scope';
import type { ToolCaller } from '../../../ai-tools/hub-tool';
import { providerGrant, type ProviderGrant } from './tool-bridge';
import type { ComputerRunnerDeps } from './ports';
import type { ProviderState } from './provider-state';
import { commandBinding } from '../../../claude/provider/command-input';
import type { ConversationAuthority } from '../../../harness/authority-contract';
import {
  eventAuthority,
  executionRole,
  admitExecutionTarget,
  withExecutionAuthority,
} from '../../turn-authority';
export async function commandAuthority(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  scope: AiNativeCommandScope,
): Promise<{ readonly grant: ProviderGrant; readonly caller: ToolCaller }> {
  const client =
    scope.client_id === null ? undefined : await effectiveClientOf(deps.store, scope.client_id);
  if (
    client !== undefined &&
    (client.role !== 'owner' ||
      (await deps.store.host.call('profiles', 'activeOf', client.id)).id !== chat.profile_id)
  )
    throw new ApiError('forbidden', 'The native command initiating owner changed.');
  const allowed = await effectiveToolsOf(deps.store, chat);
  return {
    grant: providerGrant(deps.tools(), { ...chat, tools: allowed === null ? null : [...allowed] }),
    caller: {
      profileId: chat.profile_id,
      role: 'owner',
      chatId: chat.id,
      via: 'chat',
      clientId: scope.client_id,
    },
  };
}
export function assertManualBinding(chat: AiChatRow, input: AiNativeCommandWrite): void {
  if (
    chat.engine.kind !== input.scope.runtime ||
    chat.engine.device_id !== input.scope.device_id ||
    chat.profile_id !== input.scope.profile_id ||
    chat.id !== input.scope.chat_id
  )
    throw new ApiError(
      'forbidden',
      'The manual command no longer belongs to the current native chat binding.',
    );
}

export async function manualCommandCaller(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  input: AiNativeCommandWrite,
): Promise<ToolCaller & { readonly authority: ConversationAuthority }> {
  assertManualBinding(chat, input);
  const { caller } = await commandAuthority(deps, chat, input.scope);
  const event = await deps.store.host.call('assistantEvents', 'event', input.operation_id);
  if (
    event.client_id !== input.scope.client_id ||
    event.profile_id !== chat.profile_id ||
    event.chat_id !== chat.id
  )
    throw new ApiError('forbidden', 'The native command has another initiating manual event.');
  const authority = await eventAuthority(deps.store, event);
  if (authority.client_id !== input.scope.client_id || executionRole(authority) !== 'owner')
    throw new ApiError(
      'forbidden',
      'The command initiating authority no longer permits owner execution.',
    );
  admitExecutionTarget(deps.store, chat, authority);
  return { ...caller, authority };
}
export async function assertClaudeCommandBinding(
  deps: ComputerRunnerDeps,
  state: ProviderState,
  chat: AiChatRow,
  scope: AiNativeCommandScope,
): Promise<void> {
  if (chat.engine.kind !== 'claude') return;
  const current = await state.read(chat);
  const source = [...current.events].reverse().find((event) => event.kind === 'runtime');
  const { grant } = await commandAuthority(deps, chat, scope);
  const configured = deps.directory.status(scope.device_id).settings.provider.options;
  const expected = commandBinding({
    model: chat.engine.model,
    effort: chat.engine.effort,
    options: CLAUDE_PROVIDER_OPTIONS.parse({ ...configured, ...chat.engine.settings }),
    tools: grant.tools,
  });
  if (source?.kind !== 'runtime' || source.payload['_command_binding'] !== expected)
    throw new ApiError(
      'conflict',
      'The owned Claude Query has different model, options or immutable home-tool grants; resume through an explicit normal turn first.',
    );
}
export async function withManualCommand<T>(
  deps: ComputerRunnerDeps,
  command: { readonly chat: AiChatRow; readonly input: AiNativeCommandWrite },
  work: (caller: ToolCaller) => Promise<T>,
): Promise<T> {
  const caller = await manualCommandCaller(deps, command.chat, command.input);
  return await withExecutionAuthority(caller.authority, () => work(caller));
}
