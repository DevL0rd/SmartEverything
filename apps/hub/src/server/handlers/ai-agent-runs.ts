import type { z } from 'zod';
import type { AI_AGENT_RUN_CONTROL } from '@smarteverything/domain';
import { API_ENDPOINTS, ApiError, type AiAgentRun } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { profileIdOf, roleOfCaller, type Caller } from '../auth';
import { DONE_REPLY, bound } from '../router';

type ClientCaller = Extract<Caller, { readonly kind: 'client' }>;
async function authorizeParent(
  store: Store,
  chatId: string,
  caller: Caller,
): Promise<ClientCaller> {
  if (
    caller.kind !== 'client' ||
    (await store.host.call('aiChats', 'chat', chatId)).profile_id !== profileIdOf(caller)
  )
    throw new ApiError('not_found', 'This parent chat is not available to this profile.');
  return caller;
}
async function authorizeRun(
  store: Store,
  chatId: string,
  id: string,
  caller: ClientCaller,
): Promise<AiAgentRun> {
  const run = await store.host.call('aiAgentRuns', 'read', id);
  if (
    run.parent_chat_id !== chatId ||
    ((run.source !== 'smarteverything' || run.runtime !== null) && roleOfCaller(caller) !== 'owner')
  )
    throw new ApiError(
      'not_found',
      'This agent run is not available to this parent chat and profile.',
    );
  return run;
}
export const aiAgentRunRoutes = (
  store: Store,
  control?: (
    run: AiAgentRun,
    body: z.infer<typeof AI_AGENT_RUN_CONTROL>,
    sender: { readonly clientId: string; readonly profileId: string },
  ) => Promise<void>,
) =>
  ({
    listAiAgentRuns: bound(API_ENDPOINTS.listAiAgentRuns, async ({ params, query, caller }) => {
      await authorizeParent(store, params.chatId, caller);
      const page = await store.host.call('aiAgentRuns', 'list', params.chatId, query);
      return {
        ...page,
        runs: page.runs.filter(
          (run) =>
            (run.source === 'smarteverything' && run.runtime === null) ||
            roleOfCaller(caller) === 'owner',
        ),
      };
    }),
    readAiAgentRun: bound(API_ENDPOINTS.readAiAgentRun, async ({ params, query, caller }) => {
      const client = await authorizeParent(store, params.chatId, caller);
      await authorizeRun(store, params.chatId, params.agentRunId, client);
      return store.host.call('aiAgentRuns', 'detail', params.agentRunId, query.cursor, query.limit);
    }),
    controlAiAgentRun: bound(API_ENDPOINTS.controlAiAgentRun, async ({ params, caller, body }) => {
      const client = await authorizeParent(store, params.chatId, caller);
      const run = await authorizeRun(store, params.chatId, params.agentRunId, client);
      if (control === undefined) throw new ApiError('conflict', 'Agent controls are starting.');
      await control(run, body, { clientId: client.client.id, profileId: run.profile_id });
      return DONE_REPLY;
    }),
  }) as const;
