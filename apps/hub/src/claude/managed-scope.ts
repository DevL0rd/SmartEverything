import {
  ApiError,
  type AiChatRow,
  type ClaudeCliAction,
  type ClaudeCliSession,
} from '@smarteverything/domain';
import { validateExecutionAuthority, admitExecutionDevice } from '../assistant/execution-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { ChatOwner } from '../assistant/chat-directory';
import type { ComputerRunner } from '../assistant/engines/computer/runner';
import type { ServerContext } from '../server/context';

export type ManagedClaudeContext = Pick<ServerContext, 'store' | 'assistant' | 'computerAi'>;
export interface ManagedClaudeActor extends ChatOwner {
  readonly clientId: string;
  readonly authority?: ConversationAuthority;
}
export interface ManagedClaudeScope {
  readonly chat: AiChatRow & { readonly engine: Extract<AiChatRow['engine'], { kind: 'claude' }> };
  readonly runner: ComputerRunner;
}
export function ownedClaudeScope(
  context: ManagedClaudeContext,
  actor: ManagedClaudeActor,
  deviceId: string,
  chatId: string,
): ManagedClaudeScope {
  currentClaudeActor(context, actor);
  if (actor.authority !== undefined) admitExecutionDevice(context.store, deviceId, actor.authority);
  const binding = context.store.claudeCliOperations.binding(chatId);
  const chat = context.assistant.chats.own(actor, chatId);
  if (
    binding.profile_id !== actor.profileId ||
    binding.device_id !== deviceId ||
    chat.engine.kind !== 'claude' ||
    chat.engine.device_id !== deviceId ||
    chat.engine.settings.cwd !== binding.cwd
  )
    throw new ApiError(
      'forbidden',
      'This managed CLI chat has a different profile, computer, runtime or working directory.',
    );
  const runner = context.assistant.computerProviders.get('claude');
  if (runner === undefined)
    throw new ApiError('conflict', 'The native Claude provider is starting.');
  return { chat: { ...chat, engine: chat.engine }, runner };
}
export function cliSession(
  context: ManagedClaudeContext,
  scope: ManagedClaudeScope,
): ClaudeCliSession {
  const status = context.computerAi.status(scope.chat.engine.device_id);
  const state = scope.runner.state.read(scope.chat);
  if (state.runtime !== 'claude')
    throw new ApiError('conflict', 'The managed chat has a different native runtime state.');
  const { runtime: _runtime, context: _context, ...provider } = state;
  return {
    runtime: 'claude',
    chat: scope.chat,
    cwd: context.store.claudeCliOperations.binding(scope.chat.id).cwd,
    online: status.online,
    enabled: status.settings.provider.enabled,
    provider,
  };
}
export function expectedClaudeScope(
  context: ManagedClaudeContext,
  scope: ManagedClaudeScope,
  action: Pick<ClaudeCliAction, 'session_id' | 'job_id'>,
): void {
  const state = scope.runner.state.read(scope.chat);
  if (state.session_id !== action.session_id || state.job_id !== action.job_id)
    throw new ApiError(
      'conflict',
      'The managed Claude CLI session or job changed. Read its current state before controlling it.',
    );
  if (
    state.session_id !== null &&
    !context.store.aiProvider.ownsSession(
      scope.chat.id,
      scope.chat.engine.device_id,
      state.session_id,
      'claude',
    )
  )
    throw new ApiError(
      'forbidden',
      'The native session is not owned by this exact chat and computer.',
    );
}
export function currentClaudeActor(context: ManagedClaudeContext, actor: ManagedClaudeActor): void {
  if (actor.authority !== undefined) {
    validateExecutionAuthority(context.store, actor.authority);
    if (
      actor.authority.kind !== 'client' ||
      actor.authority.role !== 'owner' ||
      actor.authority.requester === 'unlisted' ||
      actor.authority.client_id !== actor.clientId ||
      actor.authority.profile_id !== actor.profileId
    )
      throw new ApiError('forbidden', 'CLI sessions must retain their initiating app and profile.');
  }
  if (
    actor.role !== 'owner' ||
    context.store.clients.byId(actor.clientId).role !== 'owner' ||
    context.store.profiles.activeOf(actor.clientId).id !== actor.profileId
  )
    throw new ApiError(
      'forbidden',
      'The managed CLI operation requires the initiating owner client and its current profile.',
    );
}
export function readyClaudeScope(context: ManagedClaudeContext, deviceId: string): void {
  const status = context.computerAi.status(deviceId);
  if (!status.settings.provider.enabled)
    throw new ApiError(
      'claude_not_ready',
      'The native Claude provider is disabled on this computer. Enable it explicitly before running a CLI session.',
    );
  if (!status.online)
    throw new ApiError('claude_not_ready', 'The selected Claude computer is offline.');
  if (status.capabilities.provider_reason !== null)
    throw new ApiError('claude_not_ready', status.capabilities.provider_reason);
}
