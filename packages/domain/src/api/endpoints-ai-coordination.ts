import { z } from 'zod';
import { AI_ASK, AI_ASK_RESULT, AI_SUBAGENT } from '../ai-chats';
import { endpoint } from './endpoint';
import { ID, NOTHING } from './primitives';

const CHAT_PARAMS = z.strictObject({ chatId: ID });

export const AI_COORDINATION_ENDPOINTS = {
  askAiChat: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/ask',
    access: 'member',
    summary:
      'Send a message to another of your AI chats. A direct helper’s message to its parent appears under the helper’s name. Set wait to return the reply in the tool result. Otherwise the reply returns to your chat automatically.',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: AI_ASK,
    response: AI_ASK_RESULT,
  }),
  runAiSubagent: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/subagents',
    access: 'member',
    summary:
      'Start a helper in a child chat with its own engine, model and optional tool list. With wait (the default), the tool returns the answer. Otherwise the answer appears under the helper’s name in the parent thread.',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: AI_SUBAGENT,
    response: AI_ASK_RESULT,
  }),
} as const;
