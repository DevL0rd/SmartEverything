import { z } from 'zod';
import { EVENT_KINDS } from '../events';
import { JSON_VALUE } from '../values';
import { NO_BODY, endpoint } from './endpoint';
import {
  DONE,
  ID,
  MOMENT,
  NOTHING,
  POSITION,
  QUERY_IDS,
  QUERY_NAMES,
  TIME_WINDOW,
  queryLimit,
  queryList,
  somethingToChange,
} from './primitives';
import {
  COMMAND_ROW,
  DEVICE_NAME,
  DEVICE_ROW,
  EVENT_ROW,
  HISTORY_ROW,
  ROOM_NAME,
  ROOM_ROW,
  STATE_ROW,
} from './rows-home';

export const COMMAND_INPUT = z.strictObject({
  device_id: ID.nullable(),
  capability: z.string().min(1).max(120),
  value: JSON_VALUE,
  source: z.enum(['app', 'automation', 'scene']).default('app'),
});

export type CommandInput = z.input<typeof COMMAND_INPUT>;

export const HISTORY_BUCKET = z.strictObject({
  device_id: ID,
  capability: z.string().min(1),
  bucket_start: MOMENT,
  count: z.int().positive(),
  average: z.number().nullable(),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
  last: JSON_VALUE,
});

export type HistoryBucket = z.infer<typeof HISTORY_BUCKET>;

const ROOM_PARAMS = z.strictObject({ roomId: ID });
const DEVICE_PARAMS = z.strictObject({ deviceId: ID });

const SERIES = { capabilities: QUERY_NAMES, from: MOMENT, deviceIds: QUERY_IDS.optional() };

const ROOM_ENDPOINTS = {
  listRooms: endpoint({
    method: 'GET',
    path: '/api/rooms',
    access: 'member',
    summary: 'Every room in order',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(ROOM_ROW),
  }),
  createRoom: endpoint({
    method: 'POST',
    path: '/api/rooms',
    access: 'member',
    summary: 'Add a room',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ name: ROOM_NAME, position: POSITION.default(0) }),
    response: ROOM_ROW,
  }),
  updateRoom: endpoint({
    method: 'PATCH',
    path: '/api/rooms/:roomId',
    access: 'member',
    summary: 'Rename or reorder a room',
    params: ROOM_PARAMS,
    query: NOTHING,
    body: somethingToChange({ name: ROOM_NAME, position: POSITION }),
    response: ROOM_ROW,
  }),
  removeRoom: endpoint({
    method: 'DELETE',
    path: '/api/rooms/:roomId',
    access: 'member',
    summary: 'Remove a room; its devices become unplaced',
    params: ROOM_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;

const DEVICE_ENDPOINTS = {
  listDevices: endpoint({
    method: 'GET',
    path: '/api/devices',
    access: 'member',
    summary: 'Every device with its capabilities',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(DEVICE_ROW),
  }),
  updateDevice: endpoint({
    method: 'PATCH',
    path: '/api/devices/:deviceId',
    access: 'member',
    summary: 'Rename, place, hide, favourite or reorder a device',
    params: DEVICE_PARAMS,
    query: NOTHING,
    body: somethingToChange({
      display_name: DEVICE_NAME.nullable(),
      room_id: ID.nullable(),
      hidden: z.boolean(),
      favourite: z.boolean(),
      position: POSITION,
    }),
    response: DEVICE_ROW,
  }),
  listState: endpoint({
    method: 'GET',
    path: '/api/device-state',
    access: 'member',
    summary: 'The latest value of every capability of every device',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(STATE_ROW),
  }),
  readHistory: endpoint({
    method: 'GET',
    path: '/api/history',
    access: 'member',
    summary: 'State changes of the named capabilities in a time range',
    params: NOTHING,
    query: z.strictObject({
      ...SERIES,
      to: MOMENT.optional(),
      order: z.enum(['asc', 'desc']).default('asc'),
      limit: queryLimit(5000, 20_000),
    }),
    body: NO_BODY,
    response: z.array(HISTORY_ROW),
  }),
  readHistoryBuckets: endpoint({
    method: 'GET',
    path: '/api/history/buckets',
    access: 'member',
    summary: 'State changes aggregated into fixed time buckets',
    params: NOTHING,
    query: z.strictObject({
      ...SERIES,
      to: MOMENT,
      bucketSeconds: z.coerce.number().int().min(60).max(2_678_400),
    }),
    body: NO_BODY,
    response: z.array(HISTORY_BUCKET),
  }),
} as const;

const COMMAND_ENDPOINTS = {
  listCommands: endpoint({
    method: 'GET',
    path: '/api/commands',
    access: 'member',
    summary: 'The most recent commands, newest first',
    params: NOTHING,
    query: z.strictObject({ limit: queryLimit(50, 500) }),
    body: NO_BODY,
    response: z.array(COMMAND_ROW),
  }),
  readCommand: endpoint({
    method: 'GET',
    path: '/api/commands/:commandId',
    access: 'member',
    summary: 'One command and its outcome',
    params: z.strictObject({ commandId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: COMMAND_ROW,
  }),
  sendCommand: endpoint({
    method: 'POST',
    path: '/api/commands',
    access: 'member',
    summary: 'Ask a device or the hub to do something; the outcome arrives on /live',
    params: NOTHING,
    query: NOTHING,
    body: COMMAND_INPUT,
    response: COMMAND_ROW,
  }),
  sendCommands: endpoint({
    method: 'POST',
    path: '/api/commands/batch',
    access: 'member',
    summary: 'Several commands at once, validated together',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ commands: z.array(COMMAND_INPUT).min(1).max(100) }),
    response: z.array(COMMAND_ROW),
  }),
  listEvents: endpoint({
    method: 'GET',
    path: '/api/events',
    access: 'member',
    summary:
      'Events, newest first, optionally for some devices, kinds and a time range; page with to = the oldest occurred_at',
    params: NOTHING,
    query: z.strictObject({
      ...TIME_WINDOW,
      kinds: queryList(z.enum(EVENT_KINDS)).optional(),
      limit: queryLimit(100, 1000),
    }),
    body: NO_BODY,
    response: z.array(EVENT_ROW),
  }),
  acknowledgeEvent: endpoint({
    method: 'POST',
    path: '/api/events/:eventId/acknowledge',
    access: 'member',
    summary: 'Mark an event as seen or a call as answered',
    params: z.strictObject({ eventId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: EVENT_ROW,
  }),
} as const;

export const DEVICE_AREA_ENDPOINTS = {
  ...ROOM_ENDPOINTS,
  ...DEVICE_ENDPOINTS,
  ...COMMAND_ENDPOINTS,
} as const;
