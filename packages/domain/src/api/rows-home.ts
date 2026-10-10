import { z } from 'zod';
import { PLACE_NAME } from '../places';
import { COMMAND_STATUSES } from '../commands';
import { DEVICE_CAPABILITY, DEVICE_KINDS, PROVIDER } from '../devices';
import { EVENT_KINDS } from '../events';
import { FITNESS_GOALS, MAX_HEART_RATE, UNSET_FITNESS_GOALS } from '../fitness-settings';
import { PROVIDER_PROMPT } from '../hub-commands';
import { JSON_VALUE } from '../values';
import {
  CLIENT_PLATFORM,
  COUNT,
  FLAG,
  HTTPS_URL,
  ICE_SERVER,
  ID,
  JSON_OBJECT,
  MOMENT,
  POSITION,
  ROLE,
  WEBRTC_CANDIDATE,
  boundedText,
} from './primitives';

export const HOME_NAME = boundedText(80);

export const LATITUDE = z.number().min(-90).max(90);

export const LONGITUDE = z.number().min(-180).max(180);

export const SETTINGS_ROW = z.strictObject({
  home_name: HOME_NAME,
  time_zone: z.string().min(1),
  latitude: LATITUDE.nullable(),
  longitude: LONGITUDE.nullable(),
  location_name: PLACE_NAME.nullable().default(null),
  public_url: HTTPS_URL.nullable(),
  public_url_checked_at: MOMENT.nullable(),
  public_url_verified_at: MOMENT.nullable(),
  public_url_error: z.string().nullable(),
  ice_servers: z.array(ICE_SERVER),
  webrtc_candidates: z.array(WEBRTC_CANDIDATE),
  push_project_id: z.string().min(1).nullable(),
  mcp_disabled_tools: z.array(z.string().min(1)).default([]),
  fitness_goals: FITNESS_GOALS.default(UNSET_FITNESS_GOALS),
  max_heart_rate: MAX_HEART_RATE.nullable().default(null),
  updated_at: MOMENT,
});

export type SettingsRow = z.infer<typeof SETTINGS_ROW>;

export const CLIENT_NAME = boundedText(80);

export const CLIENT_ROW = z.strictObject({
  id: ID,
  name: CLIENT_NAME,
  platform: CLIENT_PLATFORM,
  role: ROLE,
  built_in: FLAG,
  profile_id: ID.nullable().default(null),
  created_at: MOMENT,
  last_seen_at: MOMENT.nullable(),
});

export type ClientRow = z.infer<typeof CLIENT_ROW>;

export const PROVIDER_STATUSES = ['linking', 'linked', 'needs_attention', 'unlinked'] as const;

export const PROVIDER_PHASES = ['signing_in', 'awaiting_answer', 'discovering'] as const;

export type ProviderPhase = (typeof PROVIDER_PHASES)[number];

export const PROVIDER_PROBLEMS = [
  'bad_credentials',
  'permission_denied',
  'network',
  'session_expired',
  'qr_expired',
  'cancelled',
  'rate_limited',
  'not_supported',
  'unknown',
] as const;

export type ProviderProblem = (typeof PROVIDER_PROBLEMS)[number];

export const PROVIDER_LINK_ROW = z.strictObject({
  provider: PROVIDER,
  account_label: z.string().nullable(),
  status: z.enum(PROVIDER_STATUSES),
  prompt: PROVIDER_PROMPT.nullable(),
  phase: z.enum(PROVIDER_PHASES).nullable().default(null),
  problem: z.enum(PROVIDER_PROBLEMS).nullable().default(null),
  last_error: z.string().nullable(),
  device_count: COUNT,
  updated_at: MOMENT,
});

export type ProviderLinkRow = z.infer<typeof PROVIDER_LINK_ROW>;

export const ROOM_NAME = boundedText(60);

export const ROOM_ROW = z.strictObject({
  id: ID,
  name: ROOM_NAME,
  position: POSITION,
});

export type RoomRow = z.infer<typeof ROOM_ROW>;

export const DEVICE_NAME = boundedText(120);

export const DEVICE_ROW = z.strictObject({
  id: ID,
  provider: PROVIDER,
  external_id: z.string().min(1),
  parent_id: ID.nullable(),
  kind: z.enum(DEVICE_KINDS),
  name: DEVICE_NAME,
  display_name: DEVICE_NAME.nullable(),
  model: z.string().min(1),
  manufacturer: z.string().min(1),
  provider_room: z.string().nullable(),
  room_id: ID.nullable(),
  online: FLAG,
  capabilities: z.array(DEVICE_CAPABILITY),
  details: JSON_OBJECT,
  hidden: FLAG,
  favourite: FLAG,
  position: POSITION,
  created_at: MOMENT,
  updated_at: MOMENT,
});

export type DeviceRow = z.infer<typeof DEVICE_ROW>;

export const STATE_ROW = z.strictObject({
  device_id: ID,
  capability: z.string().min(1),
  value: JSON_VALUE,
  observed_at: MOMENT,
});

export type StateRow = z.infer<typeof STATE_ROW>;

export const HISTORY_ROW = STATE_ROW.extend({ id: z.int().positive() });

export type HistoryRow = z.infer<typeof HISTORY_ROW>;

export const COMMAND_SOURCES = ['app', 'automation', 'scene', 'assistant'] as const;

export const COMMAND_SOURCE = z.enum(COMMAND_SOURCES);

export type CommandSource = z.infer<typeof COMMAND_SOURCE>;

export const COMMAND_ROW = z.strictObject({
  id: ID,
  device_id: ID.nullable(),
  capability: z.string().min(1),
  value: JSON_VALUE,
  status: z.enum(COMMAND_STATUSES),
  source: COMMAND_SOURCE,
  result: JSON_VALUE,
  error: z.string().nullable(),
  requested_by: ID.nullable(),
  created_at: MOMENT,
  started_at: MOMENT.nullable(),
  finished_at: MOMENT.nullable(),
  expires_at: MOMENT,
});

export type CommandRow = z.infer<typeof COMMAND_ROW>;

export const EVENT_ROW = z.strictObject({
  id: ID,
  device_id: ID.nullable(),
  kind: z.enum(EVENT_KINDS),
  occurred_at: MOMENT,
  details: JSON_OBJECT,
  acknowledged_at: MOMENT.nullable(),
  created_at: MOMENT,
});

export type EventRow = z.infer<typeof EVENT_ROW>;
