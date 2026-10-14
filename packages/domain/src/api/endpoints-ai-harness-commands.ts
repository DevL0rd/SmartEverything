import { z } from 'zod';
import {
  AI_HARNESS_COMMAND_CATALOGUE,
  AI_HARNESS_COMMAND_LIST,
  AI_HARNESS_COMMAND_WRITE,
  AI_HARNESS_COMMAND_OUTCOME,
} from '../ai-harness-commands';
import { endpoint } from './endpoint';
import { NOTHING } from './primitives';

const CHAT = z.strictObject({ chatId: z.uuid() });
export const AI_HARNESS_COMMAND_ENDPOINTS = {
  listAiChatHarnessCommands: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/harness/commands/list',
    access: 'member',
    summary: 'Discover effective human commands on this exact current native Agent',
    params: CHAT,
    query: NOTHING,
    body: AI_HARNESS_COMMAND_LIST,
    response: AI_HARNESS_COMMAND_CATALOGUE,
  }),
  executeAiChatHarnessCommand: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/harness/commands/execute',
    access: 'member',
    summary: 'Execute a direct human command without creating a model message',
    params: CHAT,
    query: NOTHING,
    body: AI_HARNESS_COMMAND_WRITE,
    response: AI_HARNESS_COMMAND_OUTCOME,
  }),
} as const;
