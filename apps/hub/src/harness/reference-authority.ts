import { ApiError } from '@smarteverything/domain';
import type { AiHarnessSession } from '@smarteverything/domain';
import type { ReferenceContext } from '../references/contracts';
import type { HarnessService } from './service';
import { roleOfCaller } from '../server/auth';

export function nativeReferenceSession(
  service: HarnessService,
  context: ReferenceContext,
): AiHarnessSession {
  const caller = context.caller;
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError('forbidden', 'Native references require their authenticated actor.');
  const owner = { profileId: context.authority.profileId, role: roleOfCaller(caller) };
  const chat = service.store.aiChats.chat(context.chat.id);
  if (chat.engine.kind !== 'dsh' || chat.engine.session_id === null)
    throw new ApiError('conflict', 'Send a message in this chat first.');
  const state = service.state(owner, chat.id);
  if (service.directory.get(state.target).host.manifest?.references?.protocol !== 1)
    throw new ApiError(
      'conflict',
      "This machine's SmartEverything is too old for file references; update it.",
    );
  return state;
}
