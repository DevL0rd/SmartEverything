import { z } from 'zod';
import { DEVICE_EFFECT_TARGET } from '../device-effects';
import { DEVICE_GROUP_ROW } from '../device-groups';
import { AUTOMATION_VALUE_ROW } from '../automation-values';
import { AUTOMATION_PLUGIN_KIND_ROW } from '../automation-plugin-kinds';
import { HOME_MAP_SUMMARY_ROW } from './endpoints-home-map';
import { DRIVE_TABLE_ROWS } from './live-drive';
import { PLANNER_TABLE_ROWS } from './live-planner';
import {
  MODEL_CATALOG_ROW,
  MODEL_OVERRIDE_ROW,
  MODEL_OWNER,
  MODEL_SHA256,
} from '../models/catalog';
import { AUTOMATION_ROW, AUTOMATION_RUN_SUMMARY } from '../automation-v3/rows';
import { BODY_READING_ROW } from '../body-readings';
import { FOOD_ROW } from '../foods';
import { WATCH_DAY_ROW } from '../watches';
import { TALK_CHANNEL_ROW, TALK_MEMBER_ROW, TALK_MESSAGE_ROW } from '../talk';
import { WEATHER_ROW } from '../weather/forecast';
import { EXCHANGE_RATES_ROW } from '../exchange-rates';
import { AI_CHAT_ROW } from '../ai-chats';
import { ASSISTANT_MESSAGE_ROW } from '../assistant';
import { AI_USAGE_ROW } from '../ai-usage';
import { HEALTH_ENTRY_ROW } from '../health-entries';
import { PROFILE_ROW } from '../profiles';
import { SCHEDULE_ROW } from '../schedules';
import { AI_OUTREACH_ROW } from '../reach';
import { PLUGIN_ROW, PLUGIN_STREAM_ROW, PLUGIN_UI_ROW } from '../plugins';
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
  HISTORY_ROW,
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
} from './rows-media';

export const ROW_OPERATIONS = ['INSERT', 'UPDATE', 'DELETE'] as const;

export type RowOperation = (typeof ROW_OPERATIONS)[number];

const MODEL_ASSET_KINDS = ['spec', 'glb'] as const;

const MODEL_ASSET_OWNER = z.union([MODEL_OWNER, z.string().regex(/^user:.+$/)]);

export const MODEL_ASSET_ROW = z.object({
  sha256: MODEL_SHA256,
  kind: z.enum(MODEL_ASSET_KINDS),
  size: z.int().positive(),
  owner: MODEL_ASSET_OWNER,
  created: z.iso.datetime({ offset: true }),
});

export const TABLE_ROWS = {
  settings: SETTINGS_ROW,
  clients: CLIENT_ROW,
  provider_links: PROVIDER_LINK_ROW,
  rooms: ROOM_ROW,
  device_groups: DEVICE_GROUP_ROW,
  device_effect_targets: DEVICE_EFFECT_TARGET,
  devices: DEVICE_ROW,
  television_settings: TELEVISION_SETTINGS_ROW,
  device_state: STATE_ROW,
  state_history: HISTORY_ROW,
  commands: COMMAND_ROW,
  events: EVENT_ROW,
  cameras: CAMERA_ROW,
  recordings: RECORDING_ROW,
  ir_remotes: IR_REMOTE_ROW,
  ir_codes: IR_CODE_ROW,
  automations: AUTOMATION_ROW,
  automation_values: AUTOMATION_VALUE_ROW,
  automation_runs: AUTOMATION_RUN_SUMMARY,
  layouts: LAYOUT_ROW,
  push_targets: PUSH_TARGET_ROW,
  health_sources: HEALTH_SOURCE_ROW,
  health_daily: HEALTH_DAILY_ROW,
  mcp_tokens: MCP_TOKEN_ROW,
  oauth_clients: OAUTH_CLIENT_ROW,
  profiles: PROFILE_ROW,
  body_readings: BODY_READING_ROW,
  health_entries: HEALTH_ENTRY_ROW,
  foods: FOOD_ROW,
  watch_days: WATCH_DAY_ROW,
  weather: WEATHER_ROW,
  exchange_rates: EXCHANGE_RATES_ROW,
  talk_channels: TALK_CHANNEL_ROW,
  talk_members: TALK_MEMBER_ROW,
  talk_messages: TALK_MESSAGE_ROW,
  assistant_messages: ASSISTANT_MESSAGE_ROW,
  ai_chats: AI_CHAT_ROW,
  scheduled_actions: SCHEDULE_ROW,
  ai_usage: AI_USAGE_ROW,
  plugins: PLUGIN_ROW,
  plugin_streams: PLUGIN_STREAM_ROW,
  plugin_ui: PLUGIN_UI_ROW,
  ai_outreach: AI_OUTREACH_ROW,
  home_maps: HOME_MAP_SUMMARY_ROW,
  model_assets: MODEL_ASSET_ROW,
  model_catalog: MODEL_CATALOG_ROW,
  model_overrides: MODEL_OVERRIDE_ROW,
  automation_plugin_kinds: AUTOMATION_PLUGIN_KIND_ROW,
  ...DRIVE_TABLE_ROWS,
  ...PLANNER_TABLE_ROWS,
} as const;

export type LiveTable = keyof typeof TABLE_ROWS;

export type TableRow<T extends LiveTable> = z.output<(typeof TABLE_ROWS)[T]>;

export const LIVE_TABLE = z.object(TABLE_ROWS).keyof();

export const LIVE_TABLES = LIVE_TABLE.options;

export function splitLiveTables(names: readonly string[]): {
  readonly known: LiveTable[];
  readonly unknown: string[];
} {
  const known: LiveTable[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const table = LIVE_TABLE.safeParse(name);
    if (table.success) known.push(table.data);
    else unknown.push(name);
  }
  return { known, unknown };
}
