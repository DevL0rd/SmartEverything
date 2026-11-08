import { z } from 'zod';
import {
  LOG_LEVEL,
  LOG_RUNTIME,
  RUNTIME_LOG_ACK,
  RUNTIME_LOG_AROUND,
  RUNTIME_LOG_BATCH,
  RUNTIME_LOG_COMPONENTS,
  RUNTIME_LOG_DROPPED,
  RUNTIME_LOG_GAP,
  RUNTIME_LOG_GAPS,
  RUNTIME_LOG_PAGE,
  RUNTIME_LOG_PLATFORMS,
  RUNTIME_LOG_SIGNATURES,
  RUNTIME_LOG_SOURCES,
  RUNTIME_LOG_SEARCH_MAX,
} from '../runtime-logs';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, MOMENT, NOTHING } from './primitives';

const LIST = z
  .string()
  .transform((text) => text.split(',').filter((part) => part !== ''))
  .pipe(z.array(z.string().min(1).max(120)));

const NAME = z.string().min(1).max(120);

export const RUNTIME_LOG_ENDPOINTS = {
  ingestDesktopRuntimeLogs: endpoint({
    method: 'POST',
    path: '/api/runtime-logs/desktop',
    access: 'owner',
    summary: 'The paired desktop sends its own redacted process logs',
    params: NOTHING,
    query: NOTHING,
    body: RUNTIME_LOG_BATCH,
    response: RUNTIME_LOG_ACK,
  }),
  ingestRuntimeLogs: endpoint({
    method: 'POST',
    path: '/api/runtime-logs',
    access: 'member',
    summary:
      'An app or device sends the log records it kept, redacted, so every runtime log is searchable in one place',
    params: NOTHING,
    query: NOTHING,
    body: RUNTIME_LOG_BATCH.extend({ clientId: z.uuid(), profileId: z.uuid() }),
    response: RUNTIME_LOG_ACK,
  }),
  searchRuntimeLogs: endpoint({
    method: 'GET',
    path: '/api/runtime-logs',
    access: 'member',
    summary:
      'Log records of every runtime by time range, level, component, runtime, device and free text; a member sees only their own devices',
    params: NOTHING,
    query: z
      .strictObject({
        from: MOMENT.optional(),
        to: MOMENT.optional(),
        toId: z.coerce.number().int().min(1).optional(),
        level: LOG_LEVEL.optional(),
        scope: NAME.optional(),
        component: NAME.optional(),
        runtime: LOG_RUNTIME.optional(),
        source: NAME.optional(),
        deviceIds: LIST.optional(),
        text: z.string().min(1).max(RUNTIME_LOG_SEARCH_MAX).optional(),
        signature: z.string().min(1).max(64).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .refine(({ to, toId }) => toId === undefined || to !== undefined, {
        message: 'The log cursor needs both a time and a record id.',
        path: ['toId'],
      }),
    body: NO_BODY,
    response: RUNTIME_LOG_PAGE,
  }),
  readRuntimeLogsAround: endpoint({
    method: 'GET',
    path: '/api/runtime-logs/around',
    access: 'member',
    summary:
      'The records just before and after one record, so a phone crash and a hub error at the same moment are read together',
    params: NOTHING,
    query: z
      .strictObject({
        id: z.coerce.number().int().min(1).optional(),
        at: MOMENT.optional(),
        before: z.coerce.number().int().min(0).max(200).default(20),
        after: z.coerce.number().int().min(0).max(200).default(20),
        level: LOG_LEVEL.optional(),
        component: NAME.optional(),
        runtime: LOG_RUNTIME.optional(),
        deviceIds: LIST.optional(),
      })
      .refine(({ id, at }) => id !== undefined || at !== undefined, {
        message: 'Supply a record id or a time to read around.',
      }),
    body: NO_BODY,
    response: RUNTIME_LOG_AROUND,
  }),
  readRuntimeLogSources: endpoint({
    method: 'GET',
    path: '/api/runtime-logs/sources',
    access: 'member',
    summary: 'Which runtime, platform and device is sending logs and how recently',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: RUNTIME_LOG_SOURCES,
  }),
  readRuntimeLogComponents: endpoint({
    method: 'GET',
    path: '/api/runtime-logs/components',
    access: 'member',
    summary: 'Which components logged and which of them failed, newest first',
    params: NOTHING,
    query: z.strictObject({
      since: MOMENT.optional(),
      levels: LIST.optional(),
    }),
    body: NO_BODY,
    response: RUNTIME_LOG_COMPONENTS,
  }),
  readRuntimeLogSignatures: endpoint({
    method: 'GET',
    path: '/api/runtime-logs/signatures',
    access: 'member',
    summary:
      'The distinct error signatures seen recently with how often and how recently each happened',
    params: NOTHING,
    query: z.strictObject({
      since: MOMENT.optional(),
      component: NAME.optional(),
    }),
    body: NO_BODY,
    response: RUNTIME_LOG_SIGNATURES,
  }),
  readRuntimeLogPlatforms: endpoint({
    method: 'GET',
    path: '/api/runtime-logs/platforms',
    access: 'member',
    summary: 'The platforms that have sent logs',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: RUNTIME_LOG_PLATFORMS,
  }),
  dropRuntimeLogs: endpoint({
    method: 'DELETE',
    path: '/api/runtime-logs',
    access: 'owner',
    summary: 'Deletes stored runtime log records, all of them or those older than a moment',
    params: NOTHING,
    query: z.strictObject({ before: MOMENT.optional() }),
    body: NO_BODY,
    response: RUNTIME_LOG_DROPPED,
  }),
  readRuntimeLogGaps: endpoint({
    method: 'GET',
    path: '/api/runtime-logs/gaps',
    access: 'member',
    summary: 'The moments a source could not reach the hub and had to drop its own records',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: RUNTIME_LOG_GAPS,
  }),
  reportRuntimeLogGap: endpoint({
    method: 'POST',
    path: '/api/runtime-logs/gaps',
    access: 'member',
    summary:
      'An app tells the hub it dropped its own oldest kept records, and which moments those covered',
    params: NOTHING,
    query: NOTHING,
    body: RUNTIME_LOG_GAP,
    response: DONE,
  }),
};
