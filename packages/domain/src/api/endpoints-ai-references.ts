import { z } from 'zod';
import { AI_REFERENCE_SEARCH, AI_REFERENCE_SEARCH_RESULT } from '../ai-references';
import { endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const AI_REFERENCE_ENDPOINTS = {
  searchAiChatReferences: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/references/search',
    access: 'member',
    summary:
      'Search bounded reference metadata available to this owned chat without loading bodies',
    params: z.strictObject({ chatId: z.uuid() }),
    query: NOTHING,
    body: AI_REFERENCE_SEARCH,
    response: AI_REFERENCE_SEARCH_RESULT,
  }),
} as const;
