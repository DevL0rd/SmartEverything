import { admitExecutionTool, currentExecutionAuthorities } from '../assistant/execution-authority';
import { createHash } from 'node:crypto';
import { ApiError, type AiReferenceSearch } from '@smarteverything/domain';
import { projectCallerAuthority } from '../projects/authority';
import { storedProjectBinding } from '../harness/project-grant';
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
  const authorities = [
    ...currentExecutionAuthorities(),
    ...((caller.kind === 'client' || caller.kind === 'service') && caller.authority !== undefined
      ? [caller.authority]
      : []),
  ];
  return {
    caller,
    authority,
    chat: store.aiChats.chat(chatId),
    validate: (): void => {
      authority.validate(false);
      if (request !== undefined)
        for (const source of authorities)
          admitExecutionTool(store, 'search_chat_references', { chatId, ...request }, source);
    },
  };
}
export function referenceScope(store: Store, context: ReferenceContext): string {
  context.validate();
  const chat = store.aiChats.chat(context.chat.id);
  const session = chat.engine.kind === 'dsh' ? chat.engine.session_id : null;
  const caller = context.caller;
  if (caller.kind !== 'client' && caller.kind !== 'service')
    throw new ApiError('forbidden', 'References require an authenticated conversation actor.');
  return createHash('sha256')
    .update(
      JSON.stringify({
        actor:
          caller.kind === 'client'
            ? {
                client_id: caller.client.id,
                role: store.clients.byId(caller.client.id).role,
                via: caller.via,
                mcp_origin: caller.mcpOrigin,
                authority: caller.authority,
                plugin_id: caller.pluginId,
                requester: caller.pluginRequester,
                chat_id: caller.chatId,
              }
            : caller.authority,
        profile: context.authority.profileId,
        chat: chat.id,
        engine: chat.engine,
        tools: chat.tools,
        binding: session === null ? null : storedProjectBinding(store, session),
        epoch: session === null ? null : store.harnessCoordination.state(session)?.epoch,
        configuration: store.harnessConfiguration.currentRevision(),
        project: store.aiProjects.find(chat.id)?.revision,
      }),
    )
    .digest('hex');
}
