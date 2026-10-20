import { APP_VIEW_ANSWER, SHOW_IN_APP_INPUT, SHOW_IN_APP_RESULT } from '../app-view';
import { endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const APP_VIEW_ENDPOINTS = {
  showInApp: endpoint({
    method: 'POST',
    path: '/api/app-view',
    access: 'member',
    summary:
      'Open a page, point at one thing on it, or clear the pointer in one of the person’s open apps, then report what the app showed; only for a person who asked to see something',
    params: NOTHING,
    query: NOTHING,
    body: SHOW_IN_APP_INPUT,
    response: SHOW_IN_APP_RESULT,
  }),
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
