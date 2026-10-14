import { EMBEDDED_BROWSER_ENDPOINTS } from './endpoints-embedded-browser';
import { PREVIEW_DIAGNOSTIC_ENDPOINTS } from './endpoints-preview-diagnostics';
import { NATIVE_HTML_LEASE, HTML_PAGE_VIEW } from '../native-html-preview';
import { z } from 'zod';
import { AI_PREVIEW_CATALOGUE, AI_PREVIEW_LEASE, AI_PREVIEW_LIFETIME } from '../ai-previews';
import {
  AI_HTML_PREVIEW_WRITE,
  AI_PROJECT_PREVIEW_WRITE,
  AI_HTML_PREVIEW_PUBLICATION,
  AI_HTML_PREVIEW_LEASE,
} from '../ai-preview-documents';
import { endpoint, NO_BODY } from './endpoint';
import { NOTHING, DONE } from './primitives';
const CHAT = z.strictObject({ chatId: z.uuid() });
export const AI_PREVIEW_ENDPOINTS = {
  readAiHtmlPage: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/page-address/:publicationId',
    access: 'member',
    summary: 'Read the stable authenticated page URL for this chat publication',
    params: CHAT.extend({ publicationId: z.uuid() }),
    query: NOTHING,
    body: NO_BODY,
    response: HTML_PAGE_VIEW,
  }),
  ...PREVIEW_DIAGNOSTIC_ENDPOINTS,
  ...EMBEDDED_BROWSER_ENDPOINTS,
  publishAiProjectPreview: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/previews/project',
    access: 'member',
    summary: 'Publish an existing central project directory with its HTML entry and local assets',
    params: CHAT,
    query: z.strictObject({ lifetime: AI_PREVIEW_LIFETIME }),
    body: AI_PROJECT_PREVIEW_WRITE,
    response: AI_HTML_PREVIEW_PUBLICATION,
  }),
  publishAiHtmlPreview: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/previews/html',
    access: 'member',
    summary:
      'Publish or update standalone HTML in this chat and open its isolated preview without a development server',
    params: CHAT,
    query: z.strictObject({ lifetime: AI_PREVIEW_LIFETIME }),
    body: AI_HTML_PREVIEW_WRITE,
    response: AI_HTML_PREVIEW_PUBLICATION,
  }),
  createAiHtmlPreviewLease: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/previews/html/lease',
    access: 'member',
    summary: 'Open an isolated HTML document browser lease for this active profile',
    params: CHAT,
    query: NOTHING,
    body: z.strictObject({
      publication_id: z.uuid(),
      revision: z.uuid(),
      lifetime: AI_PREVIEW_LIFETIME,
    }),
    response: AI_HTML_PREVIEW_LEASE,
  }),
  createAiNativeHtmlPreviewLease: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/previews/html/native/lease',
    access: 'member',
    summary:
      'Issue an isolated native HTML presentation claim for this paired viewer without a public gateway',
    params: CHAT,
    query: NOTHING,
    body: z.strictObject({
      lifetime: AI_PREVIEW_LIFETIME,
      purpose: z.literal('native-html'),
      publication_id: z.uuid(),
      revision: z.uuid(),
    }),
    response: NATIVE_HTML_LEASE,
  }),
  readAiChatPreviews: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/previews',
    access: 'member',
    summary:
      'List development services explicitly shared with this chat and isolated gateway readiness',
    params: CHAT,
    query: z.strictObject({ lifetime: AI_PREVIEW_LIFETIME }),
    body: NO_BODY,
    response: AI_PREVIEW_CATALOGUE,
  }),
  createAiPreviewLease: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/previews/lease',
    access: 'member',
    summary: 'Open a single-publication browser lease for this active profile',
    params: CHAT,
    query: NOTHING,
    body: z.strictObject({
      publication_id: z.uuid(),
      revision: z.uuid(),
      lifetime: AI_PREVIEW_LIFETIME,
    }),
    response: AI_PREVIEW_LEASE,
  }),
  releaseAiPreviewLease: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/previews/lease/release',
    access: 'member',
    summary: 'Close this paired viewer’s exact preview lease and its browser streams',
    params: CHAT,
    query: NOTHING,
    body: z.strictObject({
      lease: z.union([AI_PREVIEW_LEASE, AI_HTML_PREVIEW_LEASE, NATIVE_HTML_LEASE]),
    }),
    response: DONE,
  }),
  revokeAiPreview: endpoint({
    method: 'DELETE',
    path: '/api/ai/chats/:chatId/previews/:publicationId',
    access: 'member',
    summary: 'Revoke a shared development service and close its browser streams',
    params: z.strictObject({ chatId: z.uuid(), publicationId: z.uuid() }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
