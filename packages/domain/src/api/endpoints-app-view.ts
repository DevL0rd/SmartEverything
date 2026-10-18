import { APP_VIEW_ANSWER } from '../app-view';
import { endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const APP_VIEW_ENDPOINTS = {
  answerAppView: endpoint({
    method: 'POST',
    path: '/api/app-view/answer',
    access: 'member',
    summary: 'An app answers a request to open, point at or clear something on its screen',
    params: NOTHING,
    query: NOTHING,
    body: APP_VIEW_ANSWER,
    response: DONE,
  }),
} as const;
