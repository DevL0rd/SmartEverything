import { z } from 'zod';
import {
  AI_NATIVE_COMMAND_CATALOGUE,
  AI_NATIVE_COMMAND_WRITE,
  AI_NATIVE_COMMAND_RECEIPT,
} from '../ai-native-commands';
import { endpoint } from './endpoint';
import { NOTHING } from './primitives';
const CHAT = z.strictObject({ chatId: z.uuid() });
export const AI_NATIVE_COMMAND_ENDPOINTS = {
  listAiChatNativeCommands: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/native/commands/list',
    access: 'owner',
    summary: 'Discover commands for the current owned native session without starting a turn',
    params: CHAT,
    query: NOTHING,
    body: NOTHING,
    response: AI_NATIVE_COMMAND_CATALOGUE,
  }),
  executeAiChatNativeCommand: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/native/commands/execute',
    access: 'owner',
    summary: 'Admit an exact native command and retain its asynchronous receipt',
    params: CHAT,
    query: NOTHING,
    body: AI_NATIVE_COMMAND_WRITE,
    response: AI_NATIVE_COMMAND_RECEIPT,
  }),
  readAiChatNativeCommandReceipt: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/native/commands/:operationId',
    access: 'owner',
    summary: 'Read an owner and client bound native command receipt without replaying work',
    params: CHAT.extend({ operationId: z.uuid() }),
    query: NOTHING,
    body: NOTHING,
    response: AI_NATIVE_COMMAND_RECEIPT,
  }),
} as const;
