import { z } from 'zod';
import { PLACE_NAME } from '../places';
import { COMMAND_STATUSES } from '../commands';
import { DEVICE_CAPABILITY, DEVICE_KINDS, PROVIDER } from '../devices';
import { EVENT_KINDS } from '../events';
import { FITNESS_GOALS, MAX_HEART_RATE, UNSET_FITNESS_GOALS } from '../fitness-settings';
import { PROVIDER_PROMPT } from '../hub-commands';
import { DEVICE_REFILLS } from '../diffuser';
import { LAUNDRY_NOTICES } from '../laundry-notices';
import { DEFAULT_HISTORY_SETTINGS, HISTORY_SETTINGS } from '../history-settings';
import { DEFAULT_TRIGGER_SETTINGS, TRIGGER_SETTINGS } from '../trigger-settings';
import { IR_REMOTE_STATES } from '../ir-remote-state';
import { JSON_VALUE } from '../values';
import { MAC_ADDRESS } from '../mac-address';
import { DEFAULT_PAUSE_MS, PAUSE_MS } from '../voice-activity';
import {
  CLIENT_KIND,
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

export const DEFAULT_HOME_NAME = 'Home';

export const LATITUDE = z.number().min(-90).max(90);

export const LONGITUDE = z.number().min(-180).max(180);

export const SETTINGS_ROW = z.object({
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
  history_settings: HISTORY_SETTINGS.default(DEFAULT_HISTORY_SETTINGS),
  trigger_settings: TRIGGER_SETTINGS.default(DEFAULT_TRIGGER_SETTINGS),
  device_refills: DEVICE_REFILLS.default({}),
  laundry_notices: LAUNDRY_NOTICES.default({}),
  ir_remotes: IR_REMOTE_STATES.default({}).describe(
    'What each IR remote is assumed to be doing, by remote id (an IR remote device’s id or a learned remote’s id): on, temperature, mode, speed, mute, the last key sent, the 24 hour send times and the device that confirms its power. IR cannot report back, so these are the keys sent or what a person corrected, never a reading',
  ),
  end_of_speech_pause_ms: PAUSE_MS.default(DEFAULT_PAUSE_MS).describe(
    'How long to wait after someone stops talking before a sentence counts as finished, in milliseconds: 0 (Automatic, the default: Gemini decides when you are done in calls, so the pause adds no delay, and listening ears use a short fixed pause), 200, 320, 640, 1000 or 2500. One gate for calls and for every listening ear (cameras, computers, phones)',
  ),
  ear_host_device_id: ID.nullable()
    .default(null)
    .describe(
      'The computer that listens for the AI name on behalf of the cameras, walkie channels and Discord, or null to use the first online computer that can',
    ),
  updated_at: MOMENT,
});

export type SettingsRow = z.infer<typeof SETTINGS_ROW>;

export const CLIENT_NAME = boundedText(80);

export const CLIENT_KIND_OF_PLATFORM = {
  desktop: 'computer',
  android: 'phone',
  web: 'browser',
} as const;

const CLIENT_FIELDS = z.object({
  id: ID,
  name: CLIENT_NAME,
  platform: CLIENT_PLATFORM,
  kind: CLIENT_KIND.optional(),
  role: ROLE,
  built_in: FLAG,
  profile_id: ID.nullable().default(null),
  created_at: MOMENT,
  last_seen_at: MOMENT.nullable(),
});

export const CLIENT_ROW = CLIENT_FIELDS.transform((row) => ({
  ...row,
  kind: row.kind ?? CLIENT_KIND_OF_PLATFORM[row.platform],
}));

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

export const PROVIDER_LINK_ROW = z.object({
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

export const ROOM_ROW = z.object({
  id: ID,
  name: ROOM_NAME,
  position: POSITION,
});

export type RoomRow = z.infer<typeof ROOM_ROW>;

export const DEVICE_NAME = boundedText(120);

export const DEVICE_ROW = z.object({
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

const TELEVISION_INPUT_NAME = boundedText(40);

export const TELEVISION_INPUT_NAMES = z.record(z.string().min(1), TELEVISION_INPUT_NAME);

export type TelevisionInputNames = z.infer<typeof TELEVISION_INPUT_NAMES>;

export const TELEVISION_SETTINGS_ROW = z.object({
  device_id: ID,
  direct_host: z.string().min(1).nullable(),
  direct_mac: MAC_ADDRESS.nullable(),
  input_names: TELEVISION_INPUT_NAMES,
  wake_macs: z.array(MAC_ADDRESS),
  wake_worked_at: MOMENT.nullable(),
});

export type TelevisionSettingsRow = z.infer<typeof TELEVISION_SETTINGS_ROW>;

export const STATE_ROW = z.object({
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

export const COMMAND_ROW = z.object({
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

export const EVENT_ROW = z.object({
  id: ID,
  device_id: ID.nullable(),
  kind: z.enum(EVENT_KINDS),
  occurred_at: MOMENT,
  details: JSON_OBJECT,
  acknowledged_at: MOMENT.nullable(),
  created_at: MOMENT,
});

export type EventRow = z.infer<typeof EVENT_ROW>;
