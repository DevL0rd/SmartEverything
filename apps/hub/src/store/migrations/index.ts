import type { LogPayload } from '@smarteverything/logging';
import type { Sql } from '../sql';
import { CHAT_ACTIVITY_REPAIR } from './chat-activity';
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
import { TALK_MEMBER_LABELS, TALK_TABLES } from './talk';
import { WATCH_TABLES } from './watches';
import { WEATHER_TABLES } from './weather';
import { LOCATION_NAME_COLUMNS } from './location-name';
import { ASSISTANT_TABLES } from './assistant';
import { AI_CHAT_TABLES, createEarlierChats } from './ai-chats';
import { SCHEDULE_TABLES } from './schedules';
import { AI_USAGE_TABLES } from './ai-usage';
import { AI_COORDINATION_COLUMNS } from './ai-coordination';
import { CHAT_TITLE_COLUMNS } from './chat-titles';
import { AI_MODEL_TABLES } from './ai-models';
import { PLUGIN_TABLES } from './plugins';
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
import { APP_SESSION_TABLES } from './app-sessions';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly statements: readonly string[];
  readonly backfill?: (sql: Sql) => LogPayload;
  readonly foreignKeys?: 'off';
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'initial', statements: [...CORE_TABLES, ...MEDIA_TABLES, ...ACCESS_TABLES] },
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
];
