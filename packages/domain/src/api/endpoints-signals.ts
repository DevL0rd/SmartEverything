import { z } from 'zod';
import { AI_WAKE_ROW } from '../automation-ai';
import { SIGNAL_SUBJECTS } from '../signal-sources/spec';
import { SIGNAL_INPUT, SIGNAL_SOURCE_NAME } from '../signals';
import { TRIGGER_HOWS } from '../trigger-catalogue';
import { TRIGGER_GROUPS } from '../trigger-groups';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING, QUERY_FLAG, queryLimit } from './primitives';

const SIGNAL_FIELD_INFO = z.strictObject({
  field: z.string(),
  label: z.string(),
  unit: z.string().nullable(),
});

const SIGNAL_MATCH_INFO = z.strictObject({
  key: z.string(),
  label: z.string(),
  values: z
    .array(z.string())
    .nullable()
    .describe(
      'Allowed fixed values; null means no fixed enumeration. Match exact signal data values.',
    ),
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
      fields: z.union([z.literal('capabilities'), z.literal('free'), z.array(SIGNAL_FIELD_INFO)]),
      match: z
        .array(SIGNAL_MATCH_INFO)
        .optional()
        .describe('The keys a trigger’s match may use, with their values when they are fixed'),
      pulse: z.boolean(),
      states: z
        .strictObject({ on: z.string(), off: z.string() })
        .optional()
        .describe(
          'Set for signals that are on or off (an app open or closed): the value is true or false, and a trigger can wait for it to stay in one state',
        ),
      feed: z
        .boolean()
        .optional()
        .describe('True when each signal of this kind is also recorded in the activity feed'),
      span: z
        .strictObject({ quietSeconds: z.number() })
        .optional()
        .describe('Set when repeated pulses of this kind merge into one active period'),
      icon: z.string().optional().describe('Icon name the activity feed uses for this kind'),
      urgent: z
        .boolean()
        .optional()
        .describe('True for alarms and rings that are never dropped when the hub is flooded'),
      optIn: z
        .boolean()
        .optional()
        .describe(
          'True for privacy-sensitive kinds that stay off until the owner switches them on',
        ),
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

export const TRIGGER_CATALOGUE_QUERY = z.strictObject({
  query: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe('Words in the label, a device or room name, a plugin name or a value label'),
  group: z.enum(TRIGGER_GROUPS).optional().describe('Only this group of triggers'),
  limit: queryLimit(50, 200),
});

export type TriggerCatalogueQuery = z.output<typeof TRIGGER_CATALOGUE_QUERY>;

export const TRIGGER_CATALOGUE_ROW = z.strictObject({
  source: z.string(),
  kind: z.string(),
  label: z.string(),
  group: z.enum(TRIGGER_GROUPS),
  subject: z.string().nullable().describe('Device id for a row about one device, else null'),
  field: z.string().nullable().describe('Capability key for a row about one device value'),
  room: z.string().nullable(),
  how: z.array(z.enum(TRIGGER_HOWS)).describe('The ways a trigger can use this signal'),
  fields: z.array(z.string()).describe('Field names a trigger can read'),
  match: z.array(z.string()).describe('Keys a trigger’s match may use'),
  sentence: z.string().describe('The trigger in plain words'),
});

export const TRIGGER_CATALOGUE = z.strictObject({
  total: z.int().describe('How many triggers matched before the limit'),
  rows: z.array(TRIGGER_CATALOGUE_ROW),
});

export const SIGNAL_ENDPOINTS = {
  listSignalKinds: endpoint({
    method: 'GET',
    path: '/api/signals/kinds',
    access: 'member',
    summary:
      'Every kind of signal in the home (device values, events, weather, health, AI, scheduled actions…) with its fields, units and match keys, for “When something happens” automation triggers; set automationRuntime=true to include automation Value and run sources',
    params: NOTHING,
    query: z.strictObject({ automationRuntime: QUERY_FLAG.default(false) }),
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
  listTriggerCatalogue: endpoint({
    method: 'GET',
    path: '/api/signals/catalogue',
    access: 'member',
    summary:
      'Every trigger an automation can use, one row per signal kind and per device value, each with the ways to use it, its field and match keys and a plain-language sentence; narrow by words or group',
    params: NOTHING,
    query: TRIGGER_CATALOGUE_QUERY,
    body: NO_BODY,
    response: TRIGGER_CATALOGUE,
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
