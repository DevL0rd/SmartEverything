import type { z } from 'zod';
import type { AI_AGENT_RUN_CONTROL } from '@smarteverything/domain';
import { API_ENDPOINTS, ApiError, type AiAgentRun } from '@smarteverything/domain';
import type { Store } from '../../store/store';
import { profileIdOf, roleOfCaller, type Caller } from '../auth';
import { DONE_REPLY, bound, type RouteTable } from '../router';

function authorizeParent(store: Store, chatId: string, caller: Caller): void {
  if (
    caller.kind !== 'client' ||
    store.aiChats.chat(chatId).profile_id !== profileIdOf(store, caller)
  )
    throw new ApiError('not_found', 'This parent chat is not available to this profile.');
}
function authorizeRun(store: Store, chatId: string, id: string, caller: Caller): AiAgentRun {
  authorizeParent(store, chatId, caller);
  const run = store.aiAgentRuns.read(id);
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
export function aiAgentRunRoutes(
  store: Store,
  control?: (run: AiAgentRun, body: z.infer<typeof AI_AGENT_RUN_CONTROL>) => Promise<void>,
): Pick<RouteTable, 'listAiAgentRuns' | 'readAiAgentRun' | 'controlAiAgentRun'> {
  return {
    listAiAgentRuns: bound(API_ENDPOINTS.listAiAgentRuns, ({ params, query, caller }) => {
      authorizeParent(store, params.chatId, caller);
      const page = store.aiAgentRuns.list(params.chatId, query);
      return {
        ...page,
        runs: page.runs.filter(
          (run) =>
            (run.source === 'smarteverything' && run.runtime === null) ||
            roleOfCaller(caller) === 'owner',
        ),
      };
    }),
    readAiAgentRun: bound(API_ENDPOINTS.readAiAgentRun, ({ params, query, caller }) => {
      authorizeRun(store, params.chatId, params.agentRunId, caller);
      return store.aiAgentRuns.detail(params.agentRunId, query.cursor, query.limit);
    }),
    controlAiAgentRun: bound(API_ENDPOINTS.controlAiAgentRun, async ({ params, caller, body }) => {
      const run = authorizeRun(store, params.chatId, params.agentRunId, caller);
      if (control === undefined) throw new ApiError('conflict', 'Agent controls are starting.');
      await control(run, body);
      return DONE_REPLY;
    }),
  };
}
