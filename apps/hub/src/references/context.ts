import { admitExecutionTool, currentExecutionAuthority } from '../assistant/turn-authority';
import type { AiReferenceSearch } from '@smarteverything/domain';
import { projectCallerAuthority } from '../projects/authority';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import type { ReferenceContext } from './contracts';

export function referenceContext(
  store: Store,
  caller: Caller,
  chatId: string,
  request?: AiReferenceSearch,
): ReferenceContext {
  const authority = projectCallerAuthority(store, caller, chatId);
  const initiating =
    (caller.kind === 'client' || caller.kind === 'service' ? caller.authority : undefined) ??
    currentExecutionAuthority();
  return {
    caller,
    authority,
    chat: store.aiChats.chat(chatId),
    validate: (): void => {
      authority.validate(false);
      if (request !== undefined && initiating !== undefined)
        admitExecutionTool(store, 'search_chat_references', initiating);
    },
  };
}
