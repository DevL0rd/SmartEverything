import { z } from 'zod';
import { AI_SUBSCRIPTION_CONTROL, AI_SUBSCRIPTION_HOST_STATUS } from '../ai-subscription-host';
import { AI_HARNESS_HOST } from '../ai-harness';
import { AI_MODEL_ROUTE } from '../ai-model-route';
import {
  AI_HARNESS_ANSWER,
  AI_HARNESS_PERMISSION_CHANGE,
  AI_HARNESS_HANDOFF,
  AI_HARNESS_HANDOFF_REQUEST,
  AI_HARNESS_SESSION,
} from '../ai-harness-session';
import {
  DSH_SESSION_ID,
  DSH_SESSION_READ,
  DSH_SESSION_PAGE,
  DSH_SESSION_METADATA,
  DSH_WRITER_CLAIM,
} from '../dsh-sessions';
import { endpoint, NO_BODY } from './endpoint';
import { DONE, NOTHING, queryLimit } from './primitives';
import { HARNESS_RUNTIME_REQUEST } from '../node/harness-frames';
import {
  AI_HARNESS_CONFIGURATION_CATALOGUE,
  AI_HARNESS_CONFIGURATION_REPLACE,
  HARNESS_DESIRED_CONFIGURATION,
} from '../ai-harness-configuration';

const CHAT = z.strictObject({ chatId: z.uuid() });
const SESSION = z.strictObject({ sessionId: DSH_SESSION_ID });
export const AI_HARNESS_CATALOGUE = z.object({
  capability: z.literal('ai-harness-v1'),
  hosts: z.array(AI_HARNESS_HOST).max(1000),
  routes: z.array(AI_MODEL_ROUTE).max(1000),
});
export type AiHarnessCatalogue = z.infer<typeof AI_HARNESS_CATALOGUE>;
export const DSH_SESSION_OPENED = z.object({
  metadata: DSH_SESSION_METADATA,
  claim: DSH_WRITER_CLAIM,
});
export type DshSessionOpened = z.infer<typeof DSH_SESSION_OPENED>;

export const AI_HARNESS_CONFIGURATION_ENDPOINTS = {
  readAiHarnessConfiguration: endpoint({
    method: 'GET',
    path: '/api/ai/harness/configuration',
    access: 'member',
    summary:
      'Read the central desired extensions and each host’s last reported installation and readiness',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_HARNESS_CONFIGURATION_CATALOGUE,
  }),
  replaceAiHarnessConfiguration: endpoint({
    method: 'PUT',
    path: '/api/ai/harness/configuration',
    access: 'owner',
    summary: 'Replace the central desired extension revision after matching the current revision',
    params: NOTHING,
    query: NOTHING,
    body: AI_HARNESS_CONFIGURATION_REPLACE,
    response: HARNESS_DESIRED_CONFIGURATION,
  }),
} as const;

export const AI_HARNESS_ENDPOINTS = {
  controlAiHarnessSubscription: endpoint({
    method: 'POST',
    path: '/api/ai/harness/subscriptions',
    access: 'owner',
    summary:
      'Manage explicit subscription sign-in and billing status on an authorized supplying computer',
    params: NOTHING,
    query: NOTHING,
    body: AI_SUBSCRIPTION_CONTROL,
    response: AI_SUBSCRIPTION_HOST_STATUS,
  }),
  changeAiChatHarnessPermission: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/harness/permission',
    access: 'member',
    summary:
      'Change the current native session policy on its existing authorized host without losing history',
    params: CHAT,
    query: NOTHING,
    body: AI_HARNESS_PERMISSION_CHANGE,
    response: AI_HARNESS_SESSION,
  }),
  openAiChatHarness: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/harness/open',
    access: 'member',
    summary:
      'Admit this chat on its explicitly selected local host and issue its fenced native open request',
    params: CHAT,
    query: NOTHING,
    body: NO_BODY,
    response: HARNESS_RUNTIME_REQUEST.options[0],
  }),
  readAiHarnessCatalogue: endpoint({
    method: 'GET',
    path: '/api/ai/harness',
    access: 'member',
    summary:
      'Read eligible local execution hosts and the caller’s explicit subscription-only routes',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: AI_HARNESS_CATALOGUE,
  }),
  readAiChatHarness: endpoint({
    method: 'GET',
    path: '/api/ai/chats/:chatId/harness',
    access: 'member',
    summary: 'Read this chat’s native session, execution host, route, interactions and handoff',
    params: CHAT,
    query: NOTHING,
    body: NO_BODY,
    response: AI_HARNESS_SESSION,
  }),
  switchAiChatHarness: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/harness/switch',
    access: 'member',
    summary: 'Drain, interrupt or recover this same native chat on an explicitly selected host',
    params: CHAT,
    query: NOTHING,
    body: AI_HARNESS_HANDOFF_REQUEST,
    response: AI_HARNESS_HANDOFF,
  }),
  answerAiChatHarness: endpoint({
    method: 'POST',
    path: '/api/ai/chats/:chatId/harness/answer',
    access: 'member',
    summary: 'Answer one exact native interaction under its current execution epoch',
    params: CHAT,
    query: NOTHING,
    body: AI_HARNESS_ANSWER,
    response: DONE,
  }),
  readDshSession: endpoint({
    method: 'GET',
    path: '/api/ai/harness/sessions/:sessionId',
    access: 'member',
    summary: 'Read immutable native session metadata and committed sequence watermarks',
    params: SESSION,
    query: NOTHING,
    body: NO_BODY,
    response: DSH_SESSION_METADATA,
  }),
  listDshSessions: endpoint({
    method: 'GET',
    path: '/api/ai/harness/sessions',
    access: 'member',
    summary: 'List the caller’s canonical native session metadata',
    params: NOTHING,
    query: z.strictObject({
      before: DSH_SESSION_ID.optional(),
      limit: queryLimit(50, 200),
    }),
    body: NO_BODY,
    response: z.object({
      sessions: z.array(DSH_SESSION_METADATA).max(200),
      next_cursor: DSH_SESSION_ID.nullable(),
    }),
  }),
  readDshSessionEvents: endpoint({
    method: 'POST',
    path: '/api/ai/harness/sessions/read',
    access: 'member',
    summary: 'Read original ordered native events for authorized session replay',
    params: NOTHING,
    query: NOTHING,
    body: DSH_SESSION_READ,
    response: DSH_SESSION_PAGE,
  }),
} as const;
