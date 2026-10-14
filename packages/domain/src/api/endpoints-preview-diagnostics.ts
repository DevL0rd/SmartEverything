import { z } from 'zod';
import {
  PREVIEW_LOG_READ,
  PREVIEW_LOG_SEARCH,
  PREVIEW_LOG_PAGE,
  PREVIEW_CAPTURE_SELECTOR,
  PREVIEW_CAPTURE_RESULT,
  NATIVE_BROWSER_OPERATION,
} from '../browser-diagnostics';
import { endpoint } from './endpoint';
import { NOTHING, DONE } from './primitives';
const CHAT = z.strictObject({ chatId: z.uuid() });
export const PREVIEW_DIAGNOSTIC_ENDPOINTS = {
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
      'Capture the actual visible preview viewport on the initiating viewing device; refuses hidden or stale views; distinct from headless and execution-computer screenshots',
    params: CHAT,
    query: NOTHING,
    body: PREVIEW_CAPTURE_SELECTOR,
    response: PREVIEW_CAPTURE_RESULT,
  }),
} as const;
