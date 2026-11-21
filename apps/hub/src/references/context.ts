import { currentExecutionAuthority } from '../assistant/turn-authority';
import type { AiReferenceSearch } from '@smarteverything/domain';
import { projectCallerAuthority } from '../projects/authority';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import type { ReferenceContext } from './contracts';

export async function referenceContext(
  store: Store,
  caller: Caller,
  chatId: string,
  request?: AiReferenceSearch,
): Promise<ReferenceContext> {
  const authority = await projectCallerAuthority(store, caller, chatId);
  const initiating =
    (caller.kind === 'client' || caller.kind === 'service' ? caller.authority : undefined) ??
    currentExecutionAuthority();
  const searching = request !== undefined && initiating !== undefined ? initiating : null;
  return {
    caller,
    authority,
    chat: await store.host.call('aiChats', 'chat', chatId),
    validate: async (): Promise<void> => {
      await authority.validate(false);
      if (searching !== null)
        await store.host.read('referenceSearchAdmission', { authority: searching });
    },
  };
}
