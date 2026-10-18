import { z } from 'zod';
import {
  EMBEDDED_BROWSER_SELECTOR,
  EMBEDDED_BROWSER_EDIT,
  EMBEDDED_BROWSER_RESULT,
  EMBEDDED_BROWSER_SNAPSHOT,
} from '../embedded-browser';
import { endpoint } from './endpoint';
import { NOTHING } from './primitives';
const CHAT = z.strictObject({ chatId: z.uuid() });
export const EMBEDDED_BROWSER_ENDPOINTS = {
  readEmbeddedBrowser: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/browser/read',
    access: 'member',
    summary:
      'Read the tabs and supported actions of the most recently focused SmartEverything viewer of the chat, or of the viewer you name; no polling',
    params: CHAT,
    query: NOTHING,
    body: EMBEDDED_BROWSER_SELECTOR,
    response: EMBEDDED_BROWSER_SNAPSHOT,
  }),
  editEmbeddedBrowser: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/browser/edit',
    access: 'member',
    summary:
      'Open, select, navigate, reload, close or reorder tabs of the most recently focused embedded viewer, or of the viewer you name, with a unique request ID; never controls headless or OS browsers',
    params: CHAT,
    query: NOTHING,
    body: EMBEDDED_BROWSER_EDIT,
    response: EMBEDDED_BROWSER_RESULT,
  }),
} as const;
