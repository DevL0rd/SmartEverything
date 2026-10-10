import { z } from 'zod';
import { BODY_READING_ROW } from '../body-readings';
import { FOOD_ROW } from '../foods';
import { WATCH_DAY_ROW } from '../watches';
import { TALK_CHANNEL_ROW, TALK_FLOORS_NOTICE, TALK_MEMBER_ROW, TALK_MESSAGE_ROW } from '../talk';
import { WEATHER_ROW } from '../weather/forecast';
import { EXCHANGE_RATES_ROW } from '../exchange-rates';
import { AI_CHAT_ROW, CHAT_ACTIVITY_NOTICE, CHAT_STREAM_NOTICE } from '../ai-chats';
import { ASSISTANT_MESSAGE_ROW, ASSISTANT_STATUS_NOTICE } from '../assistant';
import { AI_USAGE_ROW } from '../ai-usage';
import { CLAUDE_NOTICES } from '../claude';
import { WATCH_ACTION_NOTICE } from '../watch-control';
import { HEALTH_ENTRY_ROW } from '../health-entries';
import { PROFILE_ROW } from '../profiles';
import { SCHEDULE_ROW } from '../schedules';
import { AI_OUTREACH_ROW, AI_SPEECH_NOTICE } from '../reach';
import { PLUGIN_ROW, PLUGIN_STREAM_ROW } from '../plugins';
import { PUSH_COMMAND } from '../push-commands';
import { JSON_VALUE } from '../values';
import { MCP_CONSENT_OUTCOME, MCP_CONSENT_REQUEST } from './assistants';
import { API_ERROR } from './errors';
import { HUB_STATUS } from './endpoints-access';
import { SMARTTHINGS_WEBHOOK } from './endpoints-smartthings';
import { FIREWALL_STATUS } from './firewall';
import { ID, ROLE, SEQ } from './primitives';
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

export const ROW_OPERATIONS = ['INSERT', 'UPDATE', 'DELETE'] as const;

export type RowOperation = (typeof ROW_OPERATIONS)[number];

export const TABLE_ROWS = {
  settings: SETTINGS_ROW,
  clients: CLIENT_ROW,
  provider_links: PROVIDER_LINK_ROW,
  rooms: ROOM_ROW,
  devices: DEVICE_ROW,
  device_state: STATE_ROW,
  state_history: HISTORY_ROW,
  commands: COMMAND_ROW,
  events: EVENT_ROW,
  cameras: CAMERA_ROW,
  recordings: RECORDING_ROW,
  ir_remotes: IR_REMOTE_ROW,
  ir_codes: IR_CODE_ROW,
  scenes: SCENE_ROW,
  automations: AUTOMATION_ROW,
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
  ai_outreach: AI_OUTREACH_ROW,
} as const;

export type LiveTable = keyof typeof TABLE_ROWS;

export type TableRow<T extends LiveTable> = z.output<(typeof TABLE_ROWS)[T]>;

const LIVE_TABLE = z.object(TABLE_ROWS).keyof();

export const LIVE_TABLES = LIVE_TABLE.options;

export const OWNER_TABLES: ReadonlySet<LiveTable> = new Set([
  'clients',
  'push_targets',
  'mcp_tokens',
  'oauth_clients',
  'plugins',
]);

export const OWN_ROW_TABLES: ReadonlySet<LiveTable> = new Set([
  'layouts',
  'assistant_messages',
  'ai_chats',
  'ai_outreach',
]);

const OPERATION = z.enum(ROW_OPERATIONS);

function changeOf<T extends LiveTable, S extends z.ZodType>(
  table: T,
  row: S,
): z.ZodObject<{
  type: z.ZodLiteral<'change'>;
  table: z.ZodLiteral<T>;
  operation: typeof OPERATION;
  record: z.ZodNullable<S>;
  oldRecord: z.ZodNullable<S>;
}> {
  return z.object({
    type: z.literal('change'),
    table: z.literal(table),
    operation: OPERATION,
    record: z.nullable(row),
    oldRecord: z.nullable(row),
  });
}

export const ROW_CHANGE = z.discriminatedUnion('table', [
  changeOf('settings', TABLE_ROWS.settings),
  changeOf('clients', TABLE_ROWS.clients),
  changeOf('provider_links', TABLE_ROWS.provider_links),
  changeOf('rooms', TABLE_ROWS.rooms),
  changeOf('devices', TABLE_ROWS.devices),
  changeOf('device_state', TABLE_ROWS.device_state),
  changeOf('state_history', TABLE_ROWS.state_history),
  changeOf('commands', TABLE_ROWS.commands),
  changeOf('events', TABLE_ROWS.events),
  changeOf('cameras', TABLE_ROWS.cameras),
  changeOf('recordings', TABLE_ROWS.recordings),
  changeOf('ir_remotes', TABLE_ROWS.ir_remotes),
  changeOf('ir_codes', TABLE_ROWS.ir_codes),
  changeOf('scenes', TABLE_ROWS.scenes),
  changeOf('automations', TABLE_ROWS.automations),
  changeOf('layouts', TABLE_ROWS.layouts),
  changeOf('push_targets', TABLE_ROWS.push_targets),
  changeOf('health_sources', TABLE_ROWS.health_sources),
  changeOf('health_daily', TABLE_ROWS.health_daily),
  changeOf('mcp_tokens', TABLE_ROWS.mcp_tokens),
  changeOf('oauth_clients', TABLE_ROWS.oauth_clients),
  changeOf('profiles', TABLE_ROWS.profiles),
  changeOf('body_readings', TABLE_ROWS.body_readings),
  changeOf('health_entries', TABLE_ROWS.health_entries),
  changeOf('foods', TABLE_ROWS.foods),
  changeOf('watch_days', TABLE_ROWS.watch_days),
  changeOf('weather', TABLE_ROWS.weather),
  changeOf('exchange_rates', TABLE_ROWS.exchange_rates),
  changeOf('talk_channels', TABLE_ROWS.talk_channels),
  changeOf('talk_members', TABLE_ROWS.talk_members),
  changeOf('talk_messages', TABLE_ROWS.talk_messages),
  changeOf('assistant_messages', TABLE_ROWS.assistant_messages),
  changeOf('ai_chats', TABLE_ROWS.ai_chats),
  changeOf('scheduled_actions', TABLE_ROWS.scheduled_actions),
  changeOf('ai_usage', TABLE_ROWS.ai_usage),
  changeOf('plugins', TABLE_ROWS.plugins),
  changeOf('plugin_streams', TABLE_ROWS.plugin_streams),
  changeOf('ai_outreach', TABLE_ROWS.ai_outreach),
]);

export type RowChange = z.output<typeof ROW_CHANGE>;

export type RowChangeInput = z.input<typeof ROW_CHANGE>;

export const LIVE_CHANGE = z.intersection(ROW_CHANGE, z.object({ seq: SEQ }));

export type LiveChange = z.output<typeof LIVE_CHANGE>;

export const LIVE_STREAMS = [
  'service_log',
  'watch_actions',
  'talk',
  'assistant',
  'claude',
] as const;

export type LiveStream = (typeof LIVE_STREAMS)[number];

const LIVE_STREAM = z.enum(LIVE_STREAMS);

export const PUSH_COMMAND_NOTICE = z.strictObject({
  type: z.literal('push_command'),
  command: PUSH_COMMAND,
  payload: JSON_VALUE,
});

export type PushCommandNotice = z.infer<typeof PUSH_COMMAND_NOTICE>;

const NOTICES = [
  z.strictObject({ type: z.literal('presence'), hub: HUB_STATUS }),
  z.strictObject({ type: z.literal('firewall'), firewall: FIREWALL_STATUS }),
  z.strictObject({ type: z.literal('refused'), error: API_ERROR.shape.error }),
  z.strictObject({ type: z.literal('mcp_consent'), request: MCP_CONSENT_REQUEST }),
  z.strictObject({
    type: z.literal('mcp_consent_closed'),
    id: ID,
    outcome: MCP_CONSENT_OUTCOME,
  }),
  z.strictObject({ type: z.literal('smartthings_webhook'), webhook: SMARTTHINGS_WEBHOOK }),
  z.strictObject({ type: z.literal('service_log'), lines: z.array(z.string()).min(1) }),
  z.strictObject({ type: z.literal('profile_changed'), profileId: ID }),
  WATCH_ACTION_NOTICE,
  TALK_FLOORS_NOTICE,
  ASSISTANT_STATUS_NOTICE,
  CHAT_ACTIVITY_NOTICE,
  CHAT_STREAM_NOTICE,
  AI_SPEECH_NOTICE,
  PUSH_COMMAND_NOTICE,
  ...CLAUDE_NOTICES,
] as const;

const READY = z.strictObject({
  type: z.literal('ready'),
  clientId: z.uuid(),
  role: ROLE,
  hub: HUB_STATUS,
  seq: SEQ,
});

const SUBSCRIBED = z.strictObject({
  type: z.literal('subscribed'),
  tables: z.array(LIVE_TABLE),
  streams: z.array(LIVE_STREAM),
  seq: SEQ,
});

export const LIVE_MESSAGE = z.union([LIVE_CHANGE, READY, SUBSCRIBED, ...NOTICES]);

export type LiveMessage = z.output<typeof LIVE_MESSAGE>;

export const LIVE_SERVER_MESSAGE = z.union([
  ROW_CHANGE,
  READY.extend({ seq: SEQ.optional() }),
  SUBSCRIBED.extend({ streams: z.array(LIVE_STREAM).optional(), seq: SEQ.optional() }),
  ...NOTICES,
]);

export type LiveServerMessage = z.output<typeof LIVE_SERVER_MESSAGE>;

export const LIVE_CLIENT_MESSAGE = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('subscribe'),
    tables: z.array(LIVE_TABLE),
    streams: z.array(LIVE_STREAM),
  }),
]);

export type LiveClientMessage = z.output<typeof LIVE_CLIENT_MESSAGE>;

export type LiveClientMessageInput = z.input<typeof LIVE_CLIENT_MESSAGE>;
