import { z } from 'zod';
import {
  AI_AGENT_RUN_CONTROL,
  AI_AGENT_RUN_DETAIL,
  AI_AGENT_RUN_PAGE,
  AI_AGENT_STATES,
} from '../ai-agent-runs';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, NOTHING, QUERY_FLAG, queryLimit } from './primitives';

const CHAT = z.strictObject({ chatId: z.uuid() });
const RUN = CHAT.extend({ agentRunId: z.uuid() });
export const AI_AGENT_RUN_ENDPOINTS = {
  listAiAgentRuns: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/agents',
    access: 'member',
    summary: 'List durable child-agent runs visible to this chat',
    params: CHAT,
    query: z.strictObject({
      cursor: z.string().max(200).optional(),
      state: z.enum(AI_AGENT_STATES).optional(),
      current_children_only: QUERY_FLAG.optional().describe(
        'Only the current task of each child, selected by its durable event cursor',
      ),
      limit: queryLimit(50, 200),
    }),
    body: NO_BODY,
    response: AI_AGENT_RUN_PAGE,
  }),
  readAiAgentRun: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/agents/:agentRunId',
    access: 'member',
    summary: 'Read a child-agent result and bounded published trace',
    params: RUN,
    query: z.strictObject({ cursor: z.string().max(200).optional(), limit: queryLimit(50, 200) }),
    body: NO_BODY,
    response: AI_AGENT_RUN_DETAIL,
  }),
  controlAiAgentRun: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/agents/:agentRunId/control',
    access: 'member',
    summary: 'Apply an advertised action to the exact child-agent run',
    params: RUN,
    query: NOTHING,
    body: AI_AGENT_RUN_CONTROL,
    response: DONE,
  }),
} as const;
