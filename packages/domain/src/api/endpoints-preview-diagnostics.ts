import { z } from 'zod';
import {
  PREVIEW_LOG_READ,
  PREVIEW_LOG_SEARCH,
  PREVIEW_LOG_PAGE,
  PREVIEW_CAPTURE_SELECTOR,
  PREVIEW_CAPTURE_RESULT,
  NATIVE_BROWSER_OPERATION,
  PREVIEW_ERROR_RULE,
  PREVIEW_ERROR_IGNORE,
  PREVIEW_ERROR_RESTORE,
} from '../browser-diagnostics';
import { endpoint } from './endpoint';
import { NOTHING, DONE } from './primitives';
const CHAT = z.strictObject({ chatId: z.uuid() });
export const PREVIEW_DIAGNOSTIC_ENDPOINTS = {
  readPreviewErrorRules: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/preview-console/error-rules',
    access: 'member',
    summary:
      'List the recurring browser errors ignored for automatic wakes in this chat; raw console logs stay complete',
    params: CHAT,
    query: NOTHING,
    body: z.undefined(),
    response: z.array(PREVIEW_ERROR_RULE),
  }),
  ignorePreviewError: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/preview-console/error-rules',
    access: 'member',
    summary:
      'Stop automatic wakes for one recurring unavoidable error, chosen by its console record id and kept with a reason; warnings never wake and no blanket rule exists',
    params: CHAT,
    query: NOTHING,
    body: PREVIEW_ERROR_IGNORE,
    response: z.array(PREVIEW_ERROR_RULE),
  }),
  restorePreviewError: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/preview-console/error-rules/restore',
    access: 'member',
    summary: 'Let one ignored recurring error wake the AI again',
    params: CHAT,
    query: NOTHING,
    body: PREVIEW_ERROR_RESTORE,
    response: z.array(PREVIEW_ERROR_RULE),
  }),
  clearPreviewWebsiteData: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/preview-console/clear-data',
    access: 'member',
    summary:
      'Clear the selected viewing-device browser cache, cookies or website storage; public tabs share their app-profile website session; app and AI credentials are never affected; unsupported platforms refuse',
    params: CHAT,
    query: NOTHING,
    body: PREVIEW_CAPTURE_SELECTOR.extend({
      action: NATIVE_BROWSER_OPERATION.shape.action.exclude(['capture']),
    }),
    response: DONE,
  }),
  readPreviewLogs: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/preview-console/read',
    access: 'member',
    summary:
      'Read bounded console text from the current viewing device with stable IDs, cursor and snapshot; never poll',
    params: CHAT,
    query: NOTHING,
    body: PREVIEW_LOG_READ,
    response: PREVIEW_LOG_PAGE,
  }),
  searchPreviewLogs: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/preview-console/search',
    access: 'member',
    summary:
      'Search literal console messages, source and stack on the current viewer with bounded surrounding context; never poll',
    params: CHAT,
    query: NOTHING,
    body: PREVIEW_LOG_SEARCH,
    response: PREVIEW_LOG_PAGE,
  }),
  capturePreviewViewport: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/preview-console/capture',
    access: 'member',
    summary:
      'Capture the actual visible preview viewport on the most recently focused viewing device; refuses hidden views; distinct from headless and execution-computer screenshots',
    params: CHAT,
    query: NOTHING,
    body: PREVIEW_CAPTURE_SELECTOR,
    response: PREVIEW_CAPTURE_RESULT,
  }),
} as const;
