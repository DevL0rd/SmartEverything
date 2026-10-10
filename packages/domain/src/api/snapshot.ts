import { z } from 'zod';
import { BODY_READINGS_SNAPSHOT, BODY_READING_ROW } from '../body-readings';
import { PROFILE_ROW } from '../profiles';
import { SCHEDULE_ROW } from '../schedules';
import { PLUGIN_ROW, PLUGIN_STREAM_ROW } from '../plugins';
import {
  TALK_CHANNEL_ROW,
  TALK_MEMBER_ROW,
  TALK_MESSAGES_SNAPSHOT,
  TALK_MESSAGE_ROW,
  TALK_PRESENCE,
} from '../talk';
import { WEATHER_ROW } from '../weather/forecast';
import { AI_CHAT_ROW, CHAT_ACTIVITY_NOTICE } from '../ai-chats';
import { ASSISTANT_MESSAGES_SNAPSHOT, ASSISTANT_MESSAGE_ROW, ASSISTANT_STATUS } from '../assistant';
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
} from './rows-home';
import {
  AUTOMATION_ROW,
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
  healthDailyDays: 30,
} as const;

export const SNAPSHOT_TABLES = z.strictObject({
  settings: SETTINGS_ROW,
  rooms: z.array(ROOM_ROW),
  devices: z.array(DEVICE_ROW),
  device_state: z.array(STATE_ROW),
  cameras: z.array(CAMERA_ROW),
  scenes: z.array(SCENE_ROW),
  automations: z.array(AUTOMATION_ROW),
  provider_links: z.array(PROVIDER_LINK_ROW),
  ir_remotes: z.array(IR_REMOTE_ROW),
  ir_codes: z.array(IR_CODE_ROW),
  layouts: z.array(LAYOUT_ROW),
  events: z.array(EVENT_ROW).max(SNAPSHOT_WINDOWS.events),
  commands: z.array(COMMAND_ROW).max(SNAPSHOT_WINDOWS.commands),
  recordings: z.array(RECORDING_ROW).max(SNAPSHOT_WINDOWS.recordings),
  health_sources: z.array(HEALTH_SOURCE_ROW),
  health_daily: z.array(HEALTH_DAILY_ROW),
  profiles: z.array(PROFILE_ROW).default([]),
  body_readings: z.array(BODY_READING_ROW).max(BODY_READINGS_SNAPSHOT).default([]),
  weather: WEATHER_ROW.optional(),
  talk_channels: z.array(TALK_CHANNEL_ROW).optional(),
  talk_members: z.array(TALK_MEMBER_ROW).optional(),
  talk_messages: z.array(TALK_MESSAGE_ROW).max(TALK_MESSAGES_SNAPSHOT).optional(),
  talk_presence: TALK_PRESENCE.optional(),
  assistant_messages: z.array(ASSISTANT_MESSAGE_ROW).max(ASSISTANT_MESSAGES_SNAPSHOT).optional(),
  assistant_status: ASSISTANT_STATUS.optional(),
  ai_chats: z.array(AI_CHAT_ROW).optional(),
  chat_activity: z.array(CHAT_ACTIVITY_NOTICE).optional(),
  scheduled_actions: z.array(SCHEDULE_ROW).optional(),
  plugin_streams: z.array(PLUGIN_STREAM_ROW).optional(),
});

export type SnapshotTables = z.infer<typeof SNAPSHOT_TABLES>;

export const OWNER_SNAPSHOT_TABLES = z.strictObject({
  clients: z.array(CLIENT_ROW),
  push_targets: z.array(PUSH_TARGET_ROW),
  mcp_tokens: z.array(MCP_TOKEN_ROW),
  oauth_clients: z.array(OAUTH_CLIENT_ROW),
  plugins: z.array(PLUGIN_ROW).optional(),
});

export type OwnerSnapshotTables = z.infer<typeof OWNER_SNAPSHOT_TABLES>;

export const SNAPSHOT = z.strictObject({
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
