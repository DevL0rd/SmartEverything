import { AI_MESSAGE_REFERENCES, referencesMatchText } from '../ai-references';
import { z } from 'zod';
import {
  AI_CHAT_BRANCH,
  AI_CHAT_CHANGE,
  AI_CHAT_HIT,
  AI_CHAT_NEW,
  AI_CHAT_ROW,
  MESSAGE_SOURCES,
} from '../ai-chats';
import { ASSISTANT_ATTACHMENTS_MAX, ASSISTANT_MESSAGE_ROW, ASSISTANT_TEXT_MAX } from '../assistant';
import { ASSISTANT_NEW_MESSAGE } from './endpoints-assistant';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, QUERY_FLAG, queryLimit } from './primitives';

const CHAT_PARAMS = z.strictObject({ chatId: ID });

const RETRY_PARAMS = z.strictObject({ chatId: ID, messageId: ID });

const AI_RETRY = z.strictObject({
  from: z
    .enum(['failed', 'answered'])
    .describe(
      'The state of the message the person is retrying; if it has moved on (already retried), nothing runs again',
    ),
});

export type AiRetryFrom = z.output<typeof AI_RETRY>['from'];

const AI_EDIT = z
  .strictObject({
    references: AI_MESSAGE_REFERENCES.optional(),
    text: z.string().trim().min(1).max(ASSISTANT_TEXT_MAX),
    attachments: z
      .array(ID)
      .max(ASSISTANT_ATTACHMENTS_MAX)
      .optional()
      .describe('Unsent uploads that replace the message’s files; left out, its files stay'),
  })
  .refine((message) => referencesMatchText(message.text, message.references ?? []), {
    message: 'Reference spans must match the submitted text.',
  });

export type AiEdit = z.output<typeof AI_EDIT>;

const AI_CHAT_SEARCH = z.strictObject({
  q: z.string().trim().min(1).max(200),
  chatId: ID.optional().describe('Search only inside this chat'),
  archived: QUERY_FLAG.default(true).describe('false leaves archived chats out'),
  limit: queryLimit(30, 100),
});

export type AiChatSearch = z.output<typeof AI_CHAT_SEARCH>;

const CHAT_ENDPOINTS = {
  listAiChats: endpoint({
    method: 'GET',
    path: '/api/ai/chats',
    access: 'member',
    summary: 'The caller’s AI chats, pinned first, then most recent',
    params: NOTHING,
    query: z.strictObject({
      archived: QUERY_FLAG.default(false),
      unread: QUERY_FLAG.optional().describe('true lists only chats with unread messages'),
      pinned: QUERY_FLAG.optional().describe('true lists only pinned chats'),
      source: z.enum(MESSAGE_SOURCES).optional().describe('Only chats that began from this source'),
    }),
    body: NO_BODY,
    response: z.array(AI_CHAT_ROW),
  }),
  searchAiChats: endpoint({
    method: 'GET',
    path: '/api/ai/chats/search',
    access: 'member',
    summary:
      'Search the caller’s AI chats, archived ones included, by title and by the text of their messages; each hit names its chat and message',
    params: NOTHING,
    query: AI_CHAT_SEARCH,
    body: NO_BODY,
    response: z.array(AI_CHAT_HIT),
  }),
  createAiChat: endpoint({
    method: 'POST',
    path: '/api/ai/chats',
    access: 'member',
    summary: 'Start a new AI chat, optionally with its engine, model and thinking',
    params: NOTHING,
    query: NOTHING,
    body: AI_CHAT_NEW,
    response: AI_CHAT_ROW,
  }),
  updateAiChat: endpoint({
    method: 'PATCH',
    path: '/api/ai/chats/:chatId',
    access: 'member',
    summary:
      'Rename, pin, archive or mark read or unread an AI chat, or change its engine, model, thinking or tools',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: AI_CHAT_CHANGE,
    response: AI_CHAT_ROW,
  }),
  branchAiChat: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/branch',
    access: 'member',
    summary:
      'Branch an AI chat into a new chat that holds it up to and including one message, with its files; the original stays as it is',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: AI_CHAT_BRANCH,
    response: AI_CHAT_ROW,
  }),
  removeAiChat: endpoint({
    method: 'DELETE',
    path: '/api/ai/chats/:chatId',
    access: 'member',
    summary: 'Delete an AI chat with its messages, files and spawned subagent descendants',
    params: CHAT_PARAMS,
    query: z.strictObject({
      expected_inactive_run_id: ID.optional().describe(
        'Delete only if this exact child run and its spawned descendants remain inactive',
      ),
    }),
    body: NO_BODY,
    response: DONE,
  }),
} as const;

const MESSAGE_ENDPOINTS = {
  compactAiChat: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/compact',
    access: 'member',
    summary: 'Compact this chat using its actual engine while preserving its canonical history',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: z.strictObject({ compacted: z.boolean() }),
  }),
  listAiChatMessages: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/messages',
    access: 'member',
    summary: 'Messages of one AI chat, newest first',
    params: CHAT_PARAMS,
    query: z.strictObject({ before: MOMENT.optional(), limit: queryLimit(50, 200) }),
    body: NO_BODY,
    response: z.array(ASSISTANT_MESSAGE_ROW),
  }),
  sendAiChatMessage: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/messages',
    access: 'member',
    summary: 'Send text and uploaded attachments into an AI chat',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: ASSISTANT_NEW_MESSAGE,
    response: ASSISTANT_MESSAGE_ROW,
  }),
  retryAiChatMessage: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/messages/:messageId/retry',
    access: 'member',
    summary:
      'Run the AI again on the chat’s latest message of the person: the failed or answered reply is replaced and no message is added',
    params: RETRY_PARAMS,
    query: NOTHING,
    body: AI_RETRY,
    response: ASSISTANT_MESSAGE_ROW,
  }),
  editAiChatMessage: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/messages/:messageId/edit',
    access: 'member',
    summary:
      'Change the text of the chat’s latest message the person wrote in the app and run the AI again on it: its answered or failed reply is replaced and no message is added',
    params: RETRY_PARAMS,
    query: NOTHING,
    body: AI_EDIT,
    response: ASSISTANT_MESSAGE_ROW,
  }),
  interruptAiChat: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/interrupt',
    access: 'member',
    summary: 'Stop the AI’s current turn in a chat',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;

export const AI_CHAT_AREA_ENDPOINTS = { ...CHAT_ENDPOINTS, ...MESSAGE_ENDPOINTS } as const;
