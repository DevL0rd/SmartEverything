import { currentProviderToolAuthority } from '../assistant/engines/computer/tool-authority';
import { currentRequestSignal } from '../server/request-signal';
import { ApiError, type AiProjectRequest } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from '../server/auth';
import { admitExecutionTool, currentExecutionAuthority } from '../assistant/turn-authority';

export interface ProjectAuthority {
  readonly chatId: string;
  readonly profileId: string;
  readonly validate: (write: boolean) => void;
}
export function projectCallerAuthority(
  store: Store,
  caller: Caller,
  chatId: string,
  request?: AiProjectRequest,
): ProjectAuthority {
  const profileId = profileIdOf(store, caller);
  const signal = currentRequestSignal();
  const native = currentProviderToolAuthority()?.validate;
  const authority =
    (caller.kind === 'client' || caller.kind === 'service' ? caller.authority : undefined) ??
    currentExecutionAuthority();
  const validate = (write: boolean): void => {
    validateNativeRequest(signal, native, write);
    const chat = store.aiChats.chat(chatId);
    if (chat.profile_id !== profileId)
      throw new ApiError('forbidden', 'The managed project belongs to a different profile.');
    store.aiChats.assertWorkAllowed(chatId);
    validateCaller(caller, chatId);
    if (write && chat.engine.kind === 'dsh' && chat.engine.permission.sandbox === 'read-only')
      throw new ApiError(
        'forbidden',
        'The current chat permission allows reading its managed project only.',
      );
    if (authority === undefined) return;
    if (
      authority.profile_id !== profileId ||
      store.assistantEvents.event(authority.event_id).chat_id !== chatId
    )
      throw new ApiError(
        'forbidden',
        'Managed project access differs from its initiating authority.',
      );
    if (request !== undefined) admitExecutionTool(store, projectTool(request), authority);
  };
  validate(false);
  return { chatId, profileId, validate };
}
function projectTool(request: AiProjectRequest): string {
  if (request.operation === 'remove') return 'remove_project_files';
  return ['stat', 'list', 'read', 'search'].includes(request.operation)
    ? 'project_read'
    : 'write_project_files';
}

function validateCaller(caller: Caller, chat: string): void {
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError(
      'forbidden',
      'Project files require a paired client or initiating service authority.',
    );
  if (caller.chatId !== undefined && caller.chatId !== null && caller.chatId !== chat)
    throw new ApiError('forbidden', 'Managed project access cannot leave its initiating chat.');
}

function validateNativeRequest(
  signal: AbortSignal | undefined,
  native: ((write: boolean) => void) | undefined,
  write: boolean,
): void {
  signal?.throwIfAborted();
  native?.(write);
}
