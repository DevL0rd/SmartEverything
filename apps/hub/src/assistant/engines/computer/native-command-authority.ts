import {
  ApiError,
  CLAUDE_PROVIDER_OPTIONS,
  type AiChatRow,
  type AiNativeCommandScope,
  type AiNativeCommandWrite,
} from '@smarteverything/domain';
import { effectiveClientById } from '../../../server/person-access';
import { effectiveTools } from '../../coordination/grants';
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
export function commandAuthority(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  scope: AiNativeCommandScope,
): { readonly grant: ProviderGrant; readonly caller: ToolCaller } {
  const client =
    scope.client_id === null ? undefined : effectiveClientById(deps.store, scope.client_id);
  if (
    client !== undefined &&
    (client.role !== 'owner' || deps.store.profiles.activeOf(client.id).id !== chat.profile_id)
  )
    throw new ApiError('forbidden', 'The native command initiating owner changed.');
  const allowed = effectiveTools(deps.store, chat);
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
export function manualCommandCaller(
  deps: ComputerRunnerDeps,
  chat: AiChatRow,
  input: AiNativeCommandWrite,
): ToolCaller & { readonly authority: ConversationAuthority } {
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
  const { caller } = commandAuthority(deps, chat, input.scope);
  const event = deps.store.assistantEvents.event(input.operation_id);
  if (
    event.client_id !== input.scope.client_id ||
    event.profile_id !== chat.profile_id ||
    event.chat_id !== chat.id
  )
    throw new ApiError('forbidden', 'The native command has another initiating manual event.');
  const authority = eventAuthority(deps.store, event);
  if (authority.client_id !== input.scope.client_id || executionRole(authority) !== 'owner')
    throw new ApiError(
      'forbidden',
      'The command initiating authority no longer permits owner execution.',
    );
  admitExecutionTarget(deps.store, chat, authority);
  return { ...caller, authority };
}
export function assertClaudeCommandBinding(
  deps: ComputerRunnerDeps,
  state: ProviderState,
  chat: AiChatRow,
  scope: AiNativeCommandScope,
): void {
  if (chat.engine.kind !== 'claude') return;
  const current = state.read(chat);
  const source = [...current.events].reverse().find((event) => event.kind === 'runtime');
  const { grant } = commandAuthority(deps, chat, scope);
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
export function withManualCommand<T>(
  deps: ComputerRunnerDeps,
  command: { readonly chat: AiChatRow; readonly input: AiNativeCommandWrite },
  work: (caller: ToolCaller) => T,
): T {
  const caller = manualCommandCaller(deps, command.chat, command.input);
  return withExecutionAuthority(caller.authority, () => work(caller));
}
