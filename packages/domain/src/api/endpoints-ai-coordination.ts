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
      'Send a message from your chat to another of your AI chats; with wait it returns the reply, otherwise the reply comes back to your chat by itself',
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
      'Start a subagent: a child chat of chatId that works on a task with its own engine, model and optional tool list; with wait (default) it returns the answer, otherwise the answer comes back to the parent chat by itself',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: AI_SUBAGENT,
    response: AI_ASK_RESULT,
  }),
} as const;
