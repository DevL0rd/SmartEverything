import { DRIVE_NOTICES } from './live-drive';
import { PLANNER_LIVE_NOTICES } from './live-planner';
import { LIVE_TABLE, ROW_OPERATIONS, TABLE_ROWS, type LiveTable } from './live-rows';
import { liveFrameSchemaOf } from './live-frames';
import { TRANSCRIPT_CHANGED_NOTICE } from '../transcript-reader';
import {
  LISTENING_CHANGED_NOTICE,
  LISTENING_EAR_NOTICE,
  LISTENING_LEVEL_NOTICE,
  WAKE_TEST_NOTICE,
} from '../listening';
import {
  VOICE_ACTIVITY_NOTICE,
  VOICE_CAPTION_NOTICE,
  VOICE_CALLS_NOTICE,
  VOICE_LEVELS_NOTICE,
  VOICE_LEVELS_WATCH,
} from '../voice-activity';
import { IMAGE_OPERATION_NOTICE, IMAGE_OPERATION_PREVIEW } from '../image-operations';
import {
  AI_CHAT_RUNTIME_PROVIDER_NOTICE,
  COMPUTER_RUNTIME_STATUS_NOTICE,
  COMPUTER_RUNTIME_NATIVE_NOTICE,
} from '../ai-runtime-provider';
import { AI_HARNESS_NOTICE } from '../ai-harness-session';
import { AI_HARNESS_CONFIGURATION_NOTICE } from '../ai-harness-extensions';
import { AI_CHAT_PROVIDER_NOTICE } from '../ai-provider';
import { AI_SUBSCRIPTION_USAGE_NOTICE } from '../ai-subscription-usage';
import { z } from 'zod';
import { TALK_FLOORS_NOTICE } from '../talk';
import { CHAT_ACTIVITY_NOTICE, CHAT_STREAM_NOTICE } from '../ai-chats';
import { ASSISTANT_STATUS_NOTICE } from '../assistant';
import { COMPUTER_AI_NOTICES } from '../computer-ai-notices';
import {
  COMPUTER_FILES_CHANGED_NOTICE,
  COMPUTER_LIVE_NOTICE,
  WATCH_MESSAGE,
} from '../node/computer-live';
import { AUTOMATION_TRACE_NOTICE, AUTOMATION_WATCH_MESSAGE } from './live-automation-trace';
import { PHONE_DETAIL_NOTICE } from '../phone-detail';
import { TREADMILL_LIVE_NOTICE } from '../treadmill-views';
import { BRUSH_LIVE_NOTICE } from '../toothbrush-views';
import { CLAUDE_NOTICES } from '../claude';
import { AI_SPEECH_NOTICE } from '../reach';
import { APP_VIEW_NOTICE } from '../app-view';
import { APP_UPDATE_NOTICE } from '../app-updates';
import { HUB_UPDATE_STATUS_CHANGED } from '../self-update-recovery';
import { CLIPBOARD_NOTICE } from '../shared-clipboard';
import { LIVE_NOTIFICATION_NOTICE } from '../live-notification';
import { PUSH_COMMAND } from '../push-commands';
import { JSON_VALUE } from '../values';
import { MCP_CONSENT_OUTCOME, MCP_CONSENT_REQUEST } from './assistants';
import { API_ERROR } from './errors';
import { HUB_STATUS } from './endpoints-access';
import { SMARTTHINGS_WEBHOOK } from './endpoints-smartthings';
import { FIREWALL_STATUS } from './firewall';
import { ID, ROLE, SEQ } from './primitives';

export const LIVE_SEQUENCE_HEADER = 'x-smarteverything-live-seq';

export const LIVE_HEARTBEAT_MS = 30_000;

export {
  LIVE_TABLES,
  MODEL_ASSET_ROW,
  ROW_OPERATIONS,
  TABLE_ROWS,
  splitLiveTables,
  type LiveTable,
  type RowOperation,
  type TableRow,
} from './live-rows';

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
  changeOf('device_groups', TABLE_ROWS.device_groups),
  changeOf('device_effect_targets', TABLE_ROWS.device_effect_targets),
  changeOf('devices', TABLE_ROWS.devices),
  changeOf('television_settings', TABLE_ROWS.television_settings),
  changeOf('device_state', TABLE_ROWS.device_state),
  changeOf('state_history', TABLE_ROWS.state_history),
  changeOf('commands', TABLE_ROWS.commands),
  changeOf('events', TABLE_ROWS.events),
  changeOf('cameras', TABLE_ROWS.cameras),
  changeOf('recordings', TABLE_ROWS.recordings),
  changeOf('ir_remotes', TABLE_ROWS.ir_remotes),
  changeOf('ir_codes', TABLE_ROWS.ir_codes),
  changeOf('automations', TABLE_ROWS.automations),
  changeOf('automation_values', TABLE_ROWS.automation_values),
  changeOf('automation_runs', TABLE_ROWS.automation_runs),
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
  changeOf('plugin_ui', TABLE_ROWS.plugin_ui),
  changeOf('ai_outreach', TABLE_ROWS.ai_outreach),
  changeOf('home_maps', TABLE_ROWS.home_maps),
  changeOf('model_assets', TABLE_ROWS.model_assets),
  changeOf('model_catalog', TABLE_ROWS.model_catalog),
  changeOf('model_overrides', TABLE_ROWS.model_overrides),
  changeOf('automation_plugin_kinds', TABLE_ROWS.automation_plugin_kinds),
  changeOf('drive_roots', TABLE_ROWS.drive_roots),
  changeOf('drive_albums', TABLE_ROWS.drive_albums),
  changeOf('drive_grants', TABLE_ROWS.drive_grants),
  changeOf('drive_placements', TABLE_ROWS.drive_placements),
  changeOf('drive_notifications', TABLE_ROWS.drive_notifications),
  changeOf('drive_access_requests', TABLE_ROWS.drive_access_requests),
  changeOf('drive_file_requests', TABLE_ROWS.drive_file_requests),
  changeOf('drive_transfers', TABLE_ROWS.drive_transfers),
  changeOf('drive_offline_items', TABLE_ROWS.drive_offline_items),
  changeOf('planner_collections', TABLE_ROWS.planner_collections),
  changeOf('planner_items', TABLE_ROWS.planner_items).extend({
    guests: z.array(z.string()).optional(),
  }),
  changeOf('planner_occurrences', TABLE_ROWS.planner_occurrences),
  changeOf('planner_alarms', TABLE_ROWS.planner_alarms),
  changeOf('planner_timers', TABLE_ROWS.planner_timers),
  changeOf('planner_stopwatches', TABLE_ROWS.planner_stopwatches),
  changeOf('planner_collection_shares', TABLE_ROWS.planner_collection_shares),
  changeOf('planner_guests', TABLE_ROWS.planner_guests),
  changeOf('planner_booking_pages', TABLE_ROWS.planner_booking_pages),
  changeOf('google_accounts', TABLE_ROWS.google_accounts),
]);

export type RowChange = z.output<typeof ROW_CHANGE>;

export type RowChangeInput = z.input<typeof ROW_CHANGE>;

export const LIVE_CHANGE = z.intersection(ROW_CHANGE, z.object({ seq: SEQ }));

export type LiveChange = z.output<typeof LIVE_CHANGE>;

export const LIVE_FRAME = z.discriminatedUnion('table', [
  liveFrameSchemaOf('settings', TABLE_ROWS.settings),
  liveFrameSchemaOf('clients', TABLE_ROWS.clients),
  liveFrameSchemaOf('provider_links', TABLE_ROWS.provider_links),
  liveFrameSchemaOf('rooms', TABLE_ROWS.rooms),
  liveFrameSchemaOf('device_groups', TABLE_ROWS.device_groups),
  liveFrameSchemaOf('device_effect_targets', TABLE_ROWS.device_effect_targets),
  liveFrameSchemaOf('devices', TABLE_ROWS.devices),
  liveFrameSchemaOf('television_settings', TABLE_ROWS.television_settings),
  liveFrameSchemaOf('device_state', TABLE_ROWS.device_state),
  liveFrameSchemaOf('state_history', TABLE_ROWS.state_history),
  liveFrameSchemaOf('commands', TABLE_ROWS.commands),
  liveFrameSchemaOf('events', TABLE_ROWS.events),
  liveFrameSchemaOf('cameras', TABLE_ROWS.cameras),
  liveFrameSchemaOf('recordings', TABLE_ROWS.recordings),
  liveFrameSchemaOf('ir_remotes', TABLE_ROWS.ir_remotes),
  liveFrameSchemaOf('ir_codes', TABLE_ROWS.ir_codes),
  liveFrameSchemaOf('automations', TABLE_ROWS.automations),
  liveFrameSchemaOf('automation_values', TABLE_ROWS.automation_values),
  liveFrameSchemaOf('automation_runs', TABLE_ROWS.automation_runs),
  liveFrameSchemaOf('layouts', TABLE_ROWS.layouts),
  liveFrameSchemaOf('push_targets', TABLE_ROWS.push_targets),
  liveFrameSchemaOf('health_sources', TABLE_ROWS.health_sources),
  liveFrameSchemaOf('health_daily', TABLE_ROWS.health_daily),
  liveFrameSchemaOf('mcp_tokens', TABLE_ROWS.mcp_tokens),
  liveFrameSchemaOf('oauth_clients', TABLE_ROWS.oauth_clients),
  liveFrameSchemaOf('profiles', TABLE_ROWS.profiles),
  liveFrameSchemaOf('body_readings', TABLE_ROWS.body_readings),
  liveFrameSchemaOf('health_entries', TABLE_ROWS.health_entries),
  liveFrameSchemaOf('foods', TABLE_ROWS.foods),
  liveFrameSchemaOf('watch_days', TABLE_ROWS.watch_days),
  liveFrameSchemaOf('weather', TABLE_ROWS.weather),
  liveFrameSchemaOf('exchange_rates', TABLE_ROWS.exchange_rates),
  liveFrameSchemaOf('talk_channels', TABLE_ROWS.talk_channels),
  liveFrameSchemaOf('talk_members', TABLE_ROWS.talk_members),
  liveFrameSchemaOf('talk_messages', TABLE_ROWS.talk_messages),
  liveFrameSchemaOf('assistant_messages', TABLE_ROWS.assistant_messages),
  liveFrameSchemaOf('ai_chats', TABLE_ROWS.ai_chats),
  liveFrameSchemaOf('scheduled_actions', TABLE_ROWS.scheduled_actions),
  liveFrameSchemaOf('ai_usage', TABLE_ROWS.ai_usage),
  liveFrameSchemaOf('plugins', TABLE_ROWS.plugins),
  liveFrameSchemaOf('plugin_streams', TABLE_ROWS.plugin_streams),
  liveFrameSchemaOf('plugin_ui', TABLE_ROWS.plugin_ui),
  liveFrameSchemaOf('ai_outreach', TABLE_ROWS.ai_outreach),
  liveFrameSchemaOf('home_maps', TABLE_ROWS.home_maps),
  liveFrameSchemaOf('model_assets', TABLE_ROWS.model_assets),
  liveFrameSchemaOf('model_catalog', TABLE_ROWS.model_catalog),
  liveFrameSchemaOf('model_overrides', TABLE_ROWS.model_overrides),
  liveFrameSchemaOf('automation_plugin_kinds', TABLE_ROWS.automation_plugin_kinds),
  liveFrameSchemaOf('drive_roots', TABLE_ROWS.drive_roots),
  liveFrameSchemaOf('drive_albums', TABLE_ROWS.drive_albums),
  liveFrameSchemaOf('drive_grants', TABLE_ROWS.drive_grants),
  liveFrameSchemaOf('drive_placements', TABLE_ROWS.drive_placements),
  liveFrameSchemaOf('drive_notifications', TABLE_ROWS.drive_notifications),
  liveFrameSchemaOf('drive_access_requests', TABLE_ROWS.drive_access_requests),
  liveFrameSchemaOf('drive_file_requests', TABLE_ROWS.drive_file_requests),
  liveFrameSchemaOf('drive_transfers', TABLE_ROWS.drive_transfers),
  liveFrameSchemaOf('drive_offline_items', TABLE_ROWS.drive_offline_items),
  liveFrameSchemaOf('planner_collections', TABLE_ROWS.planner_collections),
  liveFrameSchemaOf('planner_items', TABLE_ROWS.planner_items),
  liveFrameSchemaOf('planner_occurrences', TABLE_ROWS.planner_occurrences),
  liveFrameSchemaOf('planner_alarms', TABLE_ROWS.planner_alarms),
  liveFrameSchemaOf('planner_timers', TABLE_ROWS.planner_timers),
  liveFrameSchemaOf('planner_stopwatches', TABLE_ROWS.planner_stopwatches),
  liveFrameSchemaOf('planner_collection_shares', TABLE_ROWS.planner_collection_shares),
  liveFrameSchemaOf('planner_guests', TABLE_ROWS.planner_guests),
  liveFrameSchemaOf('planner_booking_pages', TABLE_ROWS.planner_booking_pages),
  liveFrameSchemaOf('google_accounts', TABLE_ROWS.google_accounts),
]);

export type LiveFrame = z.output<typeof LIVE_FRAME>;

export const LIVE_WIRE_CHANGE = z.intersection(LIVE_FRAME, z.object({ seq: SEQ }));

export type LiveWireChange = z.output<typeof LIVE_WIRE_CHANGE>;

export const LIVE_STREAMS = ['service_log', 'talk', 'assistant', 'claude'] as const;

export type LiveStream = (typeof LIVE_STREAMS)[number];

const LIVE_STREAM = z.enum(LIVE_STREAMS);

const PUSH_COMMAND_NOTICE = z.strictObject({
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
  TALK_FLOORS_NOTICE,
  ASSISTANT_STATUS_NOTICE,
  CHAT_ACTIVITY_NOTICE,
  CHAT_STREAM_NOTICE,
  IMAGE_OPERATION_NOTICE,
  IMAGE_OPERATION_PREVIEW,
  AI_SPEECH_NOTICE,
  CLIPBOARD_NOTICE,
  APP_VIEW_NOTICE,
  PUSH_COMMAND_NOTICE,
  LIVE_NOTIFICATION_NOTICE,
  ...CLAUDE_NOTICES,
  ...COMPUTER_AI_NOTICES,
  COMPUTER_LIVE_NOTICE,
  COMPUTER_FILES_CHANGED_NOTICE,
  PHONE_DETAIL_NOTICE,
  TREADMILL_LIVE_NOTICE,
  BRUSH_LIVE_NOTICE,
  AI_CHAT_PROVIDER_NOTICE,
  AI_SUBSCRIPTION_USAGE_NOTICE,
  AI_HARNESS_NOTICE,
  AI_HARNESS_CONFIGURATION_NOTICE,
  AI_CHAT_RUNTIME_PROVIDER_NOTICE,
  COMPUTER_RUNTIME_STATUS_NOTICE,
  COMPUTER_RUNTIME_NATIVE_NOTICE,
  TRANSCRIPT_CHANGED_NOTICE,
  LISTENING_CHANGED_NOTICE,
  LISTENING_LEVEL_NOTICE,
  WAKE_TEST_NOTICE,
  LISTENING_EAR_NOTICE,
  VOICE_ACTIVITY_NOTICE,
  VOICE_CALLS_NOTICE,
  VOICE_LEVELS_NOTICE,
  VOICE_CAPTION_NOTICE,
  APP_UPDATE_NOTICE,
  HUB_UPDATE_STATUS_CHANGED,
  z.strictObject({ type: z.literal('hub_update_source_changed') }),
  ...DRIVE_NOTICES,
  ...PLANNER_LIVE_NOTICES,
] as const;

export const LIVE_NOTICE = z.discriminatedUnion('type', NOTICES);
export type CommittedNotice = z.output<typeof LIVE_NOTICE>;

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

export const LIVE_MESSAGE = z.union([
  LIVE_CHANGE,
  z.discriminatedUnion('type', [READY, SUBSCRIBED, ...NOTICES, ...AUTOMATION_TRACE_NOTICE.options]),
]);

export type LiveMessage = z.output<typeof LIVE_MESSAGE>;

export const LIVE_WIRE_MESSAGE = z.union([
  LIVE_WIRE_CHANGE,
  z.discriminatedUnion('type', [READY, SUBSCRIBED, ...NOTICES, ...AUTOMATION_TRACE_NOTICE.options]),
]);

export type LiveWireMessage = z.output<typeof LIVE_WIRE_MESSAGE>;

export const LIVE_SERVER_MESSAGE = z.union([
  LIVE_FRAME,
  READY,
  SUBSCRIBED,
  ...NOTICES,
  ...AUTOMATION_TRACE_NOTICE.options,
]);

export type LiveServerMessage = z.output<typeof LIVE_SERVER_MESSAGE>;

export const LIVE_CLIENT_MESSAGE = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('subscribe'),
    tables: z.array(z.string()),
    streams: z.array(LIVE_STREAM),
    background: z
      .boolean()
      .optional()
      .describe('The app is not in front: this connection only receives notices for the phone'),
  }),
  WATCH_MESSAGE,
  AUTOMATION_WATCH_MESSAGE,
  VOICE_LEVELS_WATCH,
]);

export type LiveClientMessage = z.output<typeof LIVE_CLIENT_MESSAGE>;

export type LiveSubscribeMessage = Extract<LiveClientMessage, { readonly type: 'subscribe' }>;

export type LiveClientMessageInput = z.input<typeof LIVE_CLIENT_MESSAGE>;
