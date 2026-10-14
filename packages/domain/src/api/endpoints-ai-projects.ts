import { z } from 'zod';
import {
  AI_PROJECT_READ,
  AI_PROJECT_WRITE,
  AI_PROJECT_REMOVE,
  AI_PROJECT_RESULT,
} from '../ai-project-files';
import { endpoint } from './endpoint';
import { NOTHING } from './primitives';
const COMMON = {
  access: 'member',
  params: z.strictObject({ chatId: z.uuid() }),
  query: NOTHING,
  response: AI_PROJECT_RESULT,
} as const;
export const AI_PROJECT_ENDPOINTS = {
  readAiProjectFiles: endpoint({
    ...COMMON,
    method: 'POST',
    path: '/api/ai/chats/:chatId/project/read',
    summary: 'Read, list or search real files in this chat’s central managed project',
    body: AI_PROJECT_READ,
  }),
  writeAiProjectFiles: endpoint({
    ...COMMON,
    method: 'POST',
    path: '/api/ai/chats/:chatId/project/write',
    summary:
      'Create, atomically write, edit or move files in this chat’s central managed project with exact version guards',
    body: AI_PROJECT_WRITE,
  }),
  removeAiProjectFiles: endpoint({
    ...COMMON,
    method: 'POST',
    path: '/api/ai/chats/:chatId/project/remove',
    summary: 'Remove a guarded file or directory from this chat’s central managed project',
    body: AI_PROJECT_REMOVE,
  }),
} as const;
