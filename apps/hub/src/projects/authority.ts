import { currentProviderToolAuthority } from '../assistant/engines/computer/tool-authority';
import { currentRequestSignal } from '../server/request-signal';
import { ApiError, type AiProjectRequest } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from '../server/auth';
import { currentExecutionAuthority } from '../assistant/turn-authority';

export interface ProjectAuthority {
  readonly chatId: string;
  readonly profileId: string;
  readonly validate: (write: boolean) => Promise<void>;
}
export async function projectCallerAuthority(
  store: Store,
  caller: Caller,
  chatId: string,
  request?: AiProjectRequest,
): Promise<ProjectAuthority> {
  const profileId = profileIdOf(caller);
  const signal = currentRequestSignal();
  const native = currentProviderToolAuthority()?.validate;
  const authority =
    (caller.kind === 'client' || caller.kind === 'service' ? caller.authority : undefined) ??
    currentExecutionAuthority();
  const validate = async (write: boolean): Promise<void> => {
    validateNativeRequest(signal, native, write);
    await store.host.read('projectAuthority', {
      chatId,
      profileId,
      write,
      authority: authority ?? null,
      tool: request === undefined ? null : projectTool(request),
    });
    store.live.chatWork.holds.assertWork(chatId);
    validateCaller(caller, chatId);
  };
  await validate(false);
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
