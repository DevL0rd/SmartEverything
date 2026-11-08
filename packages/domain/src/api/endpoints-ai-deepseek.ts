import { z } from 'zod';
import { DEEPSEEK_KEY, DEEPSEEK_STATUS } from '../ai-deepseek';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const AI_DEEPSEEK_ENDPOINTS = {
  readDeepSeek: endpoint({
    method: 'GET',
    path: '/api/ai/deepseek',
    access: 'member',
    summary: 'Whether a DeepSeek key is saved',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DEEPSEEK_STATUS,
  }),
  setDeepSeekKey: endpoint({
    method: 'PUT',
    path: '/api/ai/deepseek/key',
    access: 'owner',
    summary: 'Save a DeepSeek key',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ key: DEEPSEEK_KEY }),
    response: DEEPSEEK_STATUS,
  }),
  removeDeepSeekKey: endpoint({
    method: 'DELETE',
    path: '/api/ai/deepseek/key',
    access: 'owner',
    summary: 'Forget the DeepSeek key',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DEEPSEEK_STATUS,
  }),
} as const;
