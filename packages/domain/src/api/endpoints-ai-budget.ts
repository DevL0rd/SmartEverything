import { AI_BUDGET_CHANGE, AI_BUDGET_STATUS } from '../ai-budget';
import { NO_BODY, endpoint } from './endpoint';
import { NOTHING } from './primitives';

export const AI_BUDGET_ENDPOINTS = {
  readAiBudget: endpoint({
    method: 'GET',
    path: '/api/ai/budget',
    access: 'member',
    summary:
      'AI budget: limits, spend today, this month and in the burn window, OpenRouter credits, and whether background AI is paused',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_BUDGET_STATUS,
  }),
  updateAiBudget: endpoint({
    method: 'PATCH',
    path: '/api/ai/budget',
    access: 'owner',
    summary:
      'Change the AI budget: daily and monthly limits in USD, early warning percent, burn alert, low credits alert and pausing background AI at the limit; null turns a limit off',
    params: NOTHING,
    query: NOTHING,
    body: AI_BUDGET_CHANGE,
    response: AI_BUDGET_STATUS,
  }),
} as const;
