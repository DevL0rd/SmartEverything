import { TRANSCRIPT_READER_COLUMNS } from './transcript-reader';
import { AI_REFERENCE_COLUMNS } from './ai-references';
import { PREVIEW_ERROR_RULE_TABLES } from './preview-error-rules';
import { NATIVE_MANAGED_PROJECT_COLUMNS } from './native-managed-projects';
import { HARNESS_SKILL_UPDATE_TABLES } from './harness-skill-updates';
import { PREVIEW_PROJECT_TABLES } from './preview-projects';
import { AI_PROJECT_TABLES } from './ai-projects';
import { EVENT_OCCURRENCE_COLUMNS } from './event-occurrences';
import { COMPUTER_NATIVE_MCP_POLICY_TABLES } from './computer-native-mcp-policy';
import { NATIVE_COMMAND_OPERATIONS_TABLES } from './native-command-operations';
import { CLAUDE_CLI_TABLES } from './claude-cli-operations';
import { BLE_OBSERVATION_TABLES } from './ble-observations';
import { HARNESS_SKILL_PRESENTATION_TABLES } from './harness-skill-presentations';
import { HARNESS_CONFIGURATION_TABLES } from './harness-configuration';
import { HARNESS_EFFECT_AUTHORITY_TABLES } from './harness-effect-authority';
import { DURABLE_EFFECT_AUTHORITY_TABLES } from './durable-effect-authorities';
import { HARNESS_DELIVERY_DELETION_TABLES } from './harness-delivery-deletion';
import { AI_SUBSCRIPTION_USAGE_COLUMNS } from './ai-subscription-usage';
import { DSH_SESSION_TABLES } from './dsh-sessions';
import { HARNESS_COORDINATION_TABLES } from './harness-coordination';
import { HARNESS_RECOVERY_TABLES } from './harness-recovery';
import { IMAGE_OPERATION_TABLES } from './image-operations';
import { COMPUTER_RUNTIME_TABLES } from './computer-runtimes';
import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';
import { CAMERA_WAKE_SENSITIVITY_COLUMNS } from './camera-wake-sensitivity';
import { CHAT_ACTIVITY_REPAIR } from './chat-activity';
import { ATTACHMENT_TRANSCRIPT_COLUMNS } from './attachment-transcripts';
import { CHAT_STATE_COLUMNS } from './chat-state';
import { CHAT_WEB_SEARCH_COLUMNS } from './chat-web-search';
import { CORE_TABLES } from './core-tables';
import { FITNESS_SETTINGS_COLUMNS, moveLegacyFitnessSettings } from './fitness-settings';
import { HOME_TIME_ZONE_COLUMNS } from './home-time-zone';
import { MCP_TOOL_SWITCHES } from './mcp-tools';
import { ENTRY_FAILURE_TABLES } from './entry-failures';
import { NUTRITION_TABLES } from './nutrition';
import { ACCESS_TABLES, MEDIA_TABLES } from './more-tables';
import { OAUTH_TABLES } from './oauth-tables';
import { PROFILE_TABLES, createFirstProfile } from './people';
import { PROVIDER_PROGRESS_COLUMNS } from './provider-progress';
import { AI_USAGE_CHAT_LINKS } from './ai-usage-chat-links';
import { AI_USAGE_SPEAK_TABLES } from './ai-usage-speak';
import { RETIRE_RESPONDERS } from './retire-responders';
import { TALK_MEMBER_LABELS, TALK_TABLES } from './talk';
import { STEP_STATE_COLUMNS } from './step-states';
import { TALK_AI_LISTENING_COLUMNS } from './talk-ai-listening';
import { WATCH_TABLES } from './watches';
import { WEATHER_TABLES } from './weather';
import { EXCHANGE_RATES_TABLES } from './exchange-rates';
import { LOCATION_NAME_COLUMNS } from './location-name';
import { ASSISTANT_TABLES } from './assistant';
import { AI_CHAT_TABLES, createEarlierChats } from './ai-chats';
import { SCHEDULE_TABLES } from './schedules';
import { AI_USAGE_TABLES } from './ai-usage';
import { AI_COORDINATION_COLUMNS } from './ai-coordination';
import { CHAT_TITLE_COLUMNS } from './chat-titles';
import { AI_MODEL_TABLES } from './ai-models';
import { PLUGIN_TABLES } from './plugins';
import { PLUGIN_PEOPLE_TABLES } from './plugin-people';
import { TRANSCRIPT_TABLES } from './transcripts';
import { SCHEDULE_ORIGIN_COLUMNS } from './schedule-origins';
import { OUTREACH_ORIGIN_COLUMNS } from './outreach-origins';
import { AI_WAKE_TABLES } from './ai-wakes';
import { AI_OUTREACH_TABLES } from './ai-outreach';
import { AI_OUTREACH_CLIENT_TABLES } from './ai-outreach-clients';
import { DEVICE_METRIC_TABLES } from './device-metrics';
import { PHONE_CONTEXT_TABLES } from './phone-contexts';

import { repriceLiveUsage } from './ai-usage-live-reprice';
import { VOICE_MEMORY_LINES } from './voice-memory-lines';
import { VOICE_HISTORY_COLUMNS } from './voice-history';
import { renameToolNames } from './tool-names';
import { COMPUTER_SCOPE_TABLES } from './computer-scopes';
import { AI_PROVIDER_TABLES } from './ai-provider';
import { AI_PROVIDER_RETENTION, retainExistingProviderEvents } from './ai-provider-retention';
import { COMPUTER_AI_TABLES } from './computer-ai';
import { APP_SESSION_TABLES } from './app-sessions';
import { RESERVED_MIGRATION_VERSIONS, inOrder } from './order';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
  readonly backfill?: (sql: Sql) => LogPayload;
  readonly foreignKeys?: 'off';
}

export const MIGRATIONS: readonly Migration[] = inOrder(
  [
    {
      version: 1,
      name: 'initial',
      statements: [...CORE_TABLES, ...MEDIA_TABLES, ...ACCESS_TABLES],
    },
    { version: 2, name: 'oauth', statements: OAUTH_TABLES },
    {
      version: 3,
      name: 'fitness_settings',
      statements: FITNESS_SETTINGS_COLUMNS,
      backfill: moveLegacyFitnessSettings,
    },
    { version: 4, name: 'mcp_tool_switches', statements: MCP_TOOL_SWITCHES },
    { version: 5, name: 'provider_progress', statements: PROVIDER_PROGRESS_COLUMNS },
    {
      version: 6,
      name: 'people',
      statements: PROFILE_TABLES,
      backfill: createFirstProfile,
      foreignKeys: 'off',
    },
    { version: 7, name: 'home_time_zone', statements: HOME_TIME_ZONE_COLUMNS },
    { version: 8, name: 'health_entries', statements: NUTRITION_TABLES },
    { version: 9, name: 'health_entry_failures', statements: ENTRY_FAILURE_TABLES },
    { version: 10, name: 'watch_days', statements: WATCH_TABLES },
    { version: 11, name: 'weather', statements: WEATHER_TABLES },
    { version: 12, name: 'talk', statements: TALK_TABLES },
    { version: 13, name: 'talk_member_labels', statements: TALK_MEMBER_LABELS },
    { version: 14, name: 'location_name', statements: LOCATION_NAME_COLUMNS },
    { version: 15, name: 'assistant_chat', statements: ASSISTANT_TABLES },
    { version: 16, name: 'ai_models', statements: AI_MODEL_TABLES },
    { version: 17, name: 'ai_usage', statements: AI_USAGE_TABLES },
    { version: 18, name: 'scheduled_actions', statements: SCHEDULE_TABLES },
    {
      version: 19,
      name: 'ai_chats',
      statements: AI_CHAT_TABLES,
      backfill: createEarlierChats,
      foreignKeys: 'off',
    },
    { version: 20, name: 'ai_coordination', statements: AI_COORDINATION_COLUMNS },
    { version: 21, name: 'device_metrics', statements: DEVICE_METRIC_TABLES },
    { version: 22, name: 'ai_usage_live_reprice', statements: [], backfill: repriceLiveUsage },
    { version: 23, name: 'chat_titles', statements: CHAT_TITLE_COLUMNS },
    { version: 24, name: 'ai_wakes', statements: AI_WAKE_TABLES },
    { version: 25, name: 'phone_contexts', statements: PHONE_CONTEXT_TABLES },
    { version: 26, name: 'plugins', statements: PLUGIN_TABLES },
    { version: 27, name: 'computer_scopes', statements: COMPUTER_SCOPE_TABLES },
    { version: 28, name: 'voice_memory_lines', statements: VOICE_MEMORY_LINES },
    { version: 29, name: 'app_sessions', statements: APP_SESSION_TABLES },
    { version: 30, name: 'ai_outreach', statements: AI_OUTREACH_TABLES },
    { version: 31, name: 'ai_outreach_clients', statements: AI_OUTREACH_CLIENT_TABLES },
    { version: 32, name: 'voice_history', statements: VOICE_HISTORY_COLUMNS },
    { version: 33, name: 'tool_names', statements: [], backfill: renameToolNames },
    { version: 34, name: 'chat_activity', statements: CHAT_ACTIVITY_REPAIR },
    { version: 35, name: 'camera_wake_sensitivity', statements: CAMERA_WAKE_SENSITIVITY_COLUMNS },
    { version: 36, name: 'retire_responders', statements: RETIRE_RESPONDERS },
    { version: 38, name: 'plugin_people', statements: PLUGIN_PEOPLE_TABLES },
    { version: 39, name: 'transcripts', statements: TRANSCRIPT_TABLES },
    { version: 40, name: 'schedule_origins', statements: SCHEDULE_ORIGIN_COLUMNS },
    { version: 41, name: 'outreach_origins', statements: OUTREACH_ORIGIN_COLUMNS },
    { version: 42, name: 'chat_state', statements: CHAT_STATE_COLUMNS },
    { version: 43, name: 'attachment_transcripts', statements: ATTACHMENT_TRANSCRIPT_COLUMNS },
    { version: 44, name: 'ai_usage_speak', statements: AI_USAGE_SPEAK_TABLES, foreignKeys: 'off' },
    { version: 45, name: 'ai_usage_chat_links', statements: AI_USAGE_CHAT_LINKS },
    { version: 46, name: 'talk_ai_listening', statements: TALK_AI_LISTENING_COLUMNS },
    { version: 47, name: 'step_states', statements: STEP_STATE_COLUMNS },
    { version: 48, name: 'chat_web_search', statements: CHAT_WEB_SEARCH_COLUMNS },
    { version: 49, name: 'exchange_rates', statements: EXCHANGE_RATES_TABLES },
    { version: 50, name: 'computer_ai', statements: COMPUTER_AI_TABLES },
    { version: 51, name: 'ai_provider', statements: AI_PROVIDER_TABLES },
    {
      version: 52,
      name: 'ai_provider_retention',
      statements: AI_PROVIDER_RETENTION,
      backfill: retainExistingProviderEvents,
    },
    { version: 53, name: 'computer_runtimes_and_agent_runs', statements: COMPUTER_RUNTIME_TABLES },
    { version: 54, name: 'ai_subscription_usage', statements: AI_SUBSCRIPTION_USAGE_COLUMNS },
    { version: 55, name: 'dsh_native_sessions', statements: DSH_SESSION_TABLES },
    { version: 56, name: 'harness_coordination', statements: HARNESS_COORDINATION_TABLES },
    { version: 58, name: 'harness_recovery', statements: HARNESS_RECOVERY_TABLES },
    { version: 60, name: 'image_operations', statements: IMAGE_OPERATION_TABLES },
    { version: 61, name: 'harness_effect_authority', statements: HARNESS_EFFECT_AUTHORITY_TABLES },
    {
      version: 62,
      name: 'harness_delivery_deletion',
      statements: HARNESS_DELIVERY_DELETION_TABLES,
    },
    { version: 63, name: 'harness_configuration', statements: HARNESS_CONFIGURATION_TABLES },
    { version: 64, name: 'ble_observations', statements: BLE_OBSERVATION_TABLES },
    {
      version: 65,
      name: 'harness_skill_presentations',
      statements: HARNESS_SKILL_PRESENTATION_TABLES,
    },
    { version: 66, name: 'claude_cli_operations', statements: CLAUDE_CLI_TABLES },
    {
      version: 67,
      name: 'native_command_operations',
      statements: NATIVE_COMMAND_OPERATIONS_TABLES,
    },
    {
      version: 68,
      name: 'computer_native_mcp_policy',
      statements: COMPUTER_NATIVE_MCP_POLICY_TABLES,
    },
    { version: 69, name: 'event_occurrences', statements: EVENT_OCCURRENCE_COLUMNS },
    {
      version: 70,
      name: 'durable_effect_authorities',
      statements: DURABLE_EFFECT_AUTHORITY_TABLES,
    },
    { version: 71, name: 'ai_projects', statements: AI_PROJECT_TABLES },
    { version: 72, name: 'preview_projects', statements: PREVIEW_PROJECT_TABLES },
    { version: 73, name: 'harness_skill_updates', statements: HARNESS_SKILL_UPDATE_TABLES },
    { version: 74, name: 'native_managed_projects', statements: NATIVE_MANAGED_PROJECT_COLUMNS },
    { version: 75, name: 'preview_error_rules', statements: PREVIEW_ERROR_RULE_TABLES },
    { version: 76, name: 'ai_message_references', statements: AI_REFERENCE_COLUMNS },
    { version: 77, name: 'transcript_reader', statements: TRANSCRIPT_READER_COLUMNS },
  ],
  RESERVED_MIGRATION_VERSIONS,
);
