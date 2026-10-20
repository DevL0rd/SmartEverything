import { DEVICE_GROUP_ROW } from '../device-groups';
import { AUTOMATION_VALUE_ROW } from '../automation-values';
import { AUTOMATION_ROW_V3, AUTOMATION_RUN_SUMMARY } from '../automation-v3/rows';
import { z } from 'zod';
import { BODY_READING_ROW } from '../body-readings';
import { PROFILE_ROW } from '../profiles';
import { SCHEDULE_ROW } from '../schedules';
import { PLUGIN_ROW, PLUGIN_STREAM_ROW, PLUGIN_UI_ROW } from '../plugins';
import { TALK_CHANNEL_ROW, TALK_MEMBER_ROW, TALK_MESSAGE_ROW, TALK_PRESENCE } from '../talk';
import { WEATHER_ROW } from '../weather/forecast';
import { EXCHANGE_RATES_ROW } from '../exchange-rates';
import { AI_CHAT_ROW, CHAT_ACTIVITY_NOTICE } from '../ai-chats';
import { ASSISTANT_MESSAGE_ROW, ASSISTANT_STATUS } from '../assistant';
import { NO_BODY, endpoint } from './endpoint';
import { SESSION } from './endpoints-access';
import { FIREWALL_STATUS } from './firewall';
import { NOTHING, QUERY_FLAG, SEQ } from './primitives';
import {
  HEALTH_DAILY_ROW,
  HEALTH_SOURCE_ROW,
  MCP_TOKEN_ROW,
  OAUTH_CLIENT_ROW,
} from './rows-access';
import {
  CLIENT_ROW,
  COMMAND_ROW,
  DEVICE_ROW,
  EVENT_ROW,
  PROVIDER_LINK_ROW,
  ROOM_ROW,
  SETTINGS_ROW,
  STATE_ROW,
  TELEVISION_SETTINGS_ROW,
} from './rows-home';
import {
  CAMERA_ROW,
  IR_CODE_ROW,
  IR_REMOTE_ROW,
  LAYOUT_ROW,
  PUSH_TARGET_ROW,
  RECORDING_ROW,
  SCENE_ROW,
} from './rows-media';

export const SNAPSHOT_WINDOWS = {
  events: 200,
  commands: 200,
  recordings: 200,
  automationRuns: 200,
  healthDailyDays: 30,
} as const;

export const SNAPSHOT_TABLES = z.object({
  settings: SETTINGS_ROW,
  rooms: z.array(ROOM_ROW),
  device_groups: z.array(DEVICE_GROUP_ROW).optional(),
  devices: z.array(DEVICE_ROW),
  television_settings: z.array(TELEVISION_SETTINGS_ROW).optional(),
  device_state: z.array(STATE_ROW),
  cameras: z.array(CAMERA_ROW),
  scenes: z.array(SCENE_ROW),
  automations: z.array(AUTOMATION_ROW_V3),
  automation_values: z.array(AUTOMATION_VALUE_ROW).optional(),
  automation_runs: z.array(AUTOMATION_RUN_SUMMARY).optional(),
  provider_links: z.array(PROVIDER_LINK_ROW),
  ir_remotes: z.array(IR_REMOTE_ROW),
  ir_codes: z.array(IR_CODE_ROW),
  layouts: z.array(LAYOUT_ROW),
  events: z.array(EVENT_ROW),
  commands: z.array(COMMAND_ROW),
  recordings: z.array(RECORDING_ROW),
  health_sources: z.array(HEALTH_SOURCE_ROW),
  health_daily: z.array(HEALTH_DAILY_ROW),
  profiles: z.array(PROFILE_ROW).default([]),
  body_readings: z.array(BODY_READING_ROW).default([]),
  weather: WEATHER_ROW.optional(),
  exchange_rates: EXCHANGE_RATES_ROW.optional(),
  talk_channels: z.array(TALK_CHANNEL_ROW).optional(),
  talk_members: z.array(TALK_MEMBER_ROW).optional(),
  talk_messages: z.array(TALK_MESSAGE_ROW).optional(),
  talk_presence: TALK_PRESENCE.optional(),
  assistant_messages: z.array(ASSISTANT_MESSAGE_ROW).optional(),
  assistant_status: ASSISTANT_STATUS.optional(),
  ai_chats: z.array(AI_CHAT_ROW).optional(),
  chat_activity: z.array(CHAT_ACTIVITY_NOTICE).optional(),
  scheduled_actions: z.array(SCHEDULE_ROW).optional(),
  plugin_streams: z.array(PLUGIN_STREAM_ROW).optional(),
  plugin_ui: z.array(PLUGIN_UI_ROW).optional(),
});

export type SnapshotTables = z.infer<typeof SNAPSHOT_TABLES>;

export const OWNER_SNAPSHOT_TABLES = z.object({
  clients: z.array(CLIENT_ROW),
  push_targets: z.array(PUSH_TARGET_ROW),
  mcp_tokens: z.array(MCP_TOKEN_ROW),
  oauth_clients: z.array(OAUTH_CLIENT_ROW),
  plugins: z.array(PLUGIN_ROW).optional(),
});

export type OwnerSnapshotTables = z.infer<typeof OWNER_SNAPSHOT_TABLES>;

export const SNAPSHOT = z.object({
  seq: SEQ,
  session: SESSION,
  firewall: FIREWALL_STATUS,
  tables: SNAPSHOT_TABLES,
  owner: OWNER_SNAPSHOT_TABLES.nullable(),
});

export type Snapshot = z.infer<typeof SNAPSHOT>;

export const SNAPSHOT_ENDPOINTS = {
  readSnapshot: endpoint({
    method: 'GET',
    path: '/api/snapshot',
    access: 'member',
    summary: 'Every live table the caller may see, at one change sequence number, in one read',
    params: NOTHING,
    query: z.strictObject({
      groupRuntime: QUERY_FLAG.default(false),
      automationRuntime: QUERY_FLAG.default(false),
      automationRunDetails: QUERY_FLAG.default(false),
      nutrition: QUERY_FLAG.default(false),
      watch: QUERY_FLAG.default(false),
      weather: QUERY_FLAG.default(false),
      talk: QUERY_FLAG.default(false),
      assistant: QUERY_FLAG.default(false),
    }),
    body: NO_BODY,
    response: SNAPSHOT,
  }),
} as const;
