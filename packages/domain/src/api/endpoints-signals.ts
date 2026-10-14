import { z } from 'zod';
import { AI_WAKE_ROW } from '../automation-ai';
import { SIGNAL_SUBJECTS } from '../signal-sources/spec';
import { SIGNAL_INPUT, SIGNAL_SOURCE_NAME } from '../signals';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING, queryLimit } from './primitives';

const SIGNAL_FIELD_INFO = z.strictObject({
  field: z.string(),
  label: z.string(),
  unit: z.string().nullable(),
});

const SIGNAL_MATCH_INFO = z.strictObject({
  key: z.string(),
  label: z.string(),
  values: z.array(z.string()).nullable(),
  valueLabels: z.record(z.string(), z.string()).optional(),
});

export const SIGNAL_SOURCE_INFO = z.strictObject({
  source: z.string(),
  label: z.string(),
  kinds: z.array(
    z.strictObject({
      kind: z.string(),
      label: z.string(),
      subject: z.enum(SIGNAL_SUBJECTS),
      fields: z.union([z.literal('capabilities'), z.array(SIGNAL_FIELD_INFO)]),
      match: z
        .array(SIGNAL_MATCH_INFO)
        .optional()
        .describe('The keys a trigger’s match may use, with their values when they are fixed'),
      pulse: z.boolean(),
    }),
  ),
});

export const SIGNAL_LATEST_QUERY = z.strictObject({
  source: SIGNAL_SOURCE_NAME,
  kind: z.string().min(1).max(80).optional(),
  subject: z.string().min(1).max(200).optional(),
  field: z.string().min(1).max(120).optional(),
  limit: queryLimit(20, 100),
});

export type SignalLatestQuery = z.output<typeof SIGNAL_LATEST_QUERY>;

export const SIGNAL_ENDPOINTS = {
  listSignalKinds: endpoint({
    method: 'GET',
    path: '/api/signals/kinds',
    access: 'member',
    summary:
      'Every kind of signal in the home (device values, events, weather, health, AI, scheduled actions…) with its fields, units and match keys, for “When something happens” automation triggers',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(SIGNAL_SOURCE_INFO),
  }),
  readSignal: endpoint({
    method: 'GET',
    path: '/api/signals/latest',
    access: 'member',
    summary:
      'The newest value of each matching signal since the server started, newest first; narrow by kind, subject (device, person, chat…) and field',
    params: NOTHING,
    query: SIGNAL_LATEST_QUERY,
    body: NO_BODY,
    response: z.array(SIGNAL_INPUT),
  }),
  listWakes: endpoint({
    method: 'GET',
    path: '/api/ai/wakes',
    access: 'member',
    summary:
      'Times automations woke the AI, newest first: what happened, the chat it went to, and whether it worked',
    params: NOTHING,
    query: z.strictObject({
      profileId: ID.optional().describe('Someone else’s wakes; owners only'),
      limit: queryLimit(20, 100),
    }),
    body: NO_BODY,
    response: z.array(AI_WAKE_ROW),
  }),
} as const;
