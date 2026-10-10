import { z } from 'zod';
import { AI_CHAT_CHANGE, AI_CHAT_NEW, AI_CHAT_ROW, ENGINE_KIND } from '../ai-chats';
import { ASSISTANT_MESSAGE_ROW, ASSISTANT_MODELS } from '../assistant';
import { ASSISTANT_NEW_MESSAGE } from './endpoints-assistant';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, QUERY_FLAG, queryLimit } from './primitives';

const CHAT_PARAMS = z.strictObject({ chatId: ID });

const CHAT_ENDPOINTS = {
  listAiChats: endpoint({
    method: 'GET',
    path: '/api/ai/chats',
    access: 'member',
    summary: 'The caller’s AI chats, pinned first, then most recent',
    params: NOTHING,
    query: z.strictObject({ archived: QUERY_FLAG.default(false) }),
    body: NO_BODY,
    response: z.array(AI_CHAT_ROW),
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
    summary: 'Rename, pin, archive an AI chat or change its engine, model, thinking or tools',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: AI_CHAT_CHANGE,
    response: AI_CHAT_ROW,
  }),
  removeAiChat: endpoint({
    method: 'DELETE',
    path: '/api/ai/chats/:chatId',
    access: 'member',
    summary: 'Delete an AI chat with its messages and files',
    params: CHAT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;

const MESSAGE_ENDPOINTS = {
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
  readEngineModels: endpoint({
    method: 'GET',
    path: '/api/ai/engines/:kind/models',
    access: 'member',
    summary: 'Models and thinking levels a Claude Code or Codex engine reports',
    params: z.strictObject({ kind: ENGINE_KIND }),
    query: NOTHING,
    body: NO_BODY,
    response: ASSISTANT_MODELS,
  }),
} as const;

export const AI_CHAT_AREA_ENDPOINTS = { ...CHAT_ENDPOINTS, ...MESSAGE_ENDPOINTS } as const;
