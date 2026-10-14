import { z } from 'zod';
import {
  CLAUDE_CLI_ACTION,
  CLAUDE_CLI_RECEIPT,
  CLAUDE_CLI_SESSION,
  CLAUDE_CLI_START,
} from '../claude-cli';
import { AI_PROVIDER_PROMPT } from '../ai-provider';
import { PROVIDER_ANSWER } from '../node/provider-turns';
import { ASSISTANT_MESSAGE_ROW } from '../assistant';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, QUERY_FLAG, queryLimit } from './primitives';

const DEVICE = z.strictObject({ deviceId: ID });
const CHAT = z.strictObject({ deviceId: ID, chatId: ID });
export const CLAUDE_CLI_ENDPOINTS = {
  startClaudeCliSession: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/claude/cli/sessions',
    access: 'owner',
    summary:
      'Start an owned Claude CLI chat and queue its first actual native turn on this computer',
    params: DEVICE,
    query: NOTHING,
    body: CLAUDE_CLI_START,
    response: CLAUDE_CLI_RECEIPT,
  }),
  listClaudeCliSessions: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/claude/cli/sessions',
    access: 'owner',
    summary:
      'List the caller’s managed Claude CLI chats, including stopped sessions without starting a process',
    params: DEVICE,
    query: z.strictObject({ archived: QUERY_FLAG.default(false), limit: queryLimit(50, 200) }),
    body: NO_BODY,
    response: z.array(CLAUDE_CLI_SESSION),
  }),
  readClaudeCliSession: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/claude/cli/sessions/:chatId',
    access: 'owner',
    summary: 'Read one owned Claude CLI chat and its saved native state without starting a process',
    params: CHAT,
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_CLI_SESSION,
  }),
  readClaudeCliHistory: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/claude/cli/sessions/:chatId/messages',
    access: 'owner',
    summary:
      'Read canonical shared history of an owned Claude CLI chat, including stopped sessions',
    params: CHAT,
    query: z.strictObject({ before: MOMENT.optional(), limit: queryLimit(50, 200) }),
    body: NO_BODY,
    response: z.array(ASSISTANT_MESSAGE_ROW),
  }),
  controlClaudeCliSession: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/claude/cli/sessions/:chatId/actions',
    access: 'owner',
    summary:
      'Send, explicitly resume, stop, close or configure the exact owned Claude CLI session and job',
    params: CHAT,
    query: NOTHING,
    body: CLAUDE_CLI_ACTION,
    response: CLAUDE_CLI_RECEIPT,
  }),
  readClaudeCliPrompts: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/claude/cli/sessions/:chatId/prompts',
    access: 'owner',
    summary:
      'Read saved permission, question, plan and elicitation requests of an owned CLI chat without starting a process',
    params: CHAT,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(AI_PROVIDER_PROMPT),
  }),
  answerClaudeCliPrompt: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/claude/cli/sessions/:chatId/prompts/:promptId',
    access: 'owner',
    summary:
      'Answer an exact current owned CLI permission, question, plan or elicitation request on its original session and job',
    params: CHAT.extend({ promptId: z.string().min(1).max(200) }),
    query: NOTHING,
    body: z.strictObject({
      session_id: z.string().min(1).max(200).nullable(),
      job_id: ID,
      answer: PROVIDER_ANSWER,
    }),
    response: DONE,
  }),
  readClaudeCliOperation: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/claude/cli/operations/:operationId',
    access: 'owner',
    summary: 'Read an owned durable Claude CLI operation receipt without repeating the operation',
    params: z.strictObject({ deviceId: ID, operationId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: CLAUDE_CLI_RECEIPT,
  }),
} as const;
