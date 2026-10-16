import { DEVICE_EFFECT_ENDPOINTS } from './endpoints-device-effects';
import { DEVICE_GROUP_ENDPOINTS } from './endpoints-device-groups';
import { AI_REFERENCE_ENDPOINTS } from './endpoints-ai-references';
import { AI_PROJECT_ENDPOINTS } from './endpoints-ai-projects';
import { AI_NATIVE_COMMAND_ENDPOINTS } from './endpoints-ai-native-commands';
import { AI_PREVIEW_ENDPOINTS } from './endpoints-ai-previews';
import { AI_HARNESS_COMMAND_ENDPOINTS } from './endpoints-ai-harness-commands';
import { IMAGE_AREA_ENDPOINTS } from './endpoints-images';
import { AI_HARNESS_EXTENSION_ENDPOINTS } from './endpoints-ai-harness-extensions';
import { AI_HARNESS_ENDPOINTS, AI_HARNESS_CONFIGURATION_ENDPOINTS } from './endpoints-ai-harness';
import { COMPUTER_RUNTIME_ENDPOINTS } from './endpoints-computer-runtimes';
import { AI_AGENT_RUN_ENDPOINTS } from './endpoints-ai-agent-runs';
import { AI_PROVIDER_ENDPOINTS } from './endpoints-ai-provider';
import type { z } from 'zod';
import { MCP_ACCESS_ENDPOINTS } from './assistants';
import { ASSISTANT_AREA_ENDPOINTS } from './endpoints-assistant';
import { AI_CHAT_AREA_ENDPOINTS } from './endpoints-ai-chats';
import { AI_COORDINATION_ENDPOINTS } from './endpoints-ai-coordination';
import { ASSISTANT_VOICE_ENDPOINTS } from './endpoints-assistant-voice';
import { AI_USAGE_ENDPOINTS } from './endpoints-ai-usage';
import { AI_BUDGET_ENDPOINTS } from './endpoints-ai-budget';
import { AI_MODEL_ENDPOINTS } from './endpoints-ai-models';
import { ACCESS_ENDPOINTS } from './endpoints-access';
import { CONNECTION_ENDPOINTS } from './endpoints-connections';
import { AUTOMATION_AREA_ENDPOINTS } from './endpoints-automation';
import { CALL_ENDPOINTS } from './endpoints-calls';
import { CLAUDE_CLI_ENDPOINTS } from './endpoints-claude-cli';
import { CLAUDE_ENDPOINTS } from './endpoints-claude';
import { CLIENT_FAILURE_ENDPOINTS } from './endpoints-client-failures';
import { COMPUTER_AI_ENDPOINTS } from './endpoints-computer-ai';
import { COMPUTER_NODE_ENDPOINTS } from './endpoints-computer-nodes';
import { COMPUTER_ENDPOINTS } from './endpoints-computers';
import { COMPUTER_SESSION_ENDPOINTS } from './endpoints-computer-session';
import { DEVICE_AREA_ENDPOINTS } from './endpoints-devices';
import { FIREWALL_ENDPOINTS } from './firewall';
import { HEALTH_AREA_ENDPOINTS } from './endpoints-health';
import { MEDIA_ENDPOINTS } from './endpoints-media';
import { NUTRITION_AREA_ENDPOINTS } from './endpoints-nutrition';
import { PEOPLE_AREA_ENDPOINTS } from './endpoints-people';
import { SETTINGS_AREA_ENDPOINTS } from './endpoints-settings';
import { SNAPSHOT_ENDPOINTS } from './snapshot';
import { TALK_AREA_ENDPOINTS } from './endpoints-talk';
import { WATCH_AREA_ENDPOINTS } from './endpoints-watches';
import { WEATHER_AREA_ENDPOINTS } from './endpoints-weather';
import { EXCHANGE_RATES_AREA_ENDPOINTS } from './endpoints-exchange-rates';
import { PLACE_AREA_ENDPOINTS } from './endpoints-places';
import { SCHEDULE_ENDPOINTS } from './endpoints-schedules';
import { PLUGIN_ENDPOINTS } from './endpoints-plugins';
import { PHONE_AREA_ENDPOINTS } from './endpoints-phones';
import { SIGNAL_ENDPOINTS } from './endpoints-signals';
import { REACH_ENDPOINTS } from './endpoints-reach';
import { TRANSCRIPT_ENDPOINTS } from './endpoints-transcripts';

type ApiEndpointRegistry = typeof DEVICE_EFFECT_ENDPOINTS &
  typeof DEVICE_GROUP_ENDPOINTS &
  typeof AI_REFERENCE_ENDPOINTS &
  typeof AI_PROJECT_ENDPOINTS &
  typeof AI_NATIVE_COMMAND_ENDPOINTS &
  typeof AI_PREVIEW_ENDPOINTS &
  typeof AI_HARNESS_COMMAND_ENDPOINTS &
  typeof IMAGE_AREA_ENDPOINTS &
  typeof AI_HARNESS_EXTENSION_ENDPOINTS &
  typeof AI_HARNESS_ENDPOINTS &
  typeof AI_HARNESS_CONFIGURATION_ENDPOINTS &
  typeof AI_PROVIDER_ENDPOINTS &
  typeof COMPUTER_RUNTIME_ENDPOINTS &
  typeof AI_AGENT_RUN_ENDPOINTS &
  typeof AI_MODEL_ENDPOINTS &
  typeof ACCESS_ENDPOINTS &
  typeof CONNECTION_ENDPOINTS &
  typeof CLIENT_FAILURE_ENDPOINTS &
  typeof SNAPSHOT_ENDPOINTS &
  typeof SETTINGS_AREA_ENDPOINTS &
  typeof DEVICE_AREA_ENDPOINTS &
  typeof MEDIA_ENDPOINTS &
  typeof FIREWALL_ENDPOINTS &
  typeof AUTOMATION_AREA_ENDPOINTS &
  typeof HEALTH_AREA_ENDPOINTS &
  typeof MCP_ACCESS_ENDPOINTS &
  typeof PEOPLE_AREA_ENDPOINTS &
  typeof NUTRITION_AREA_ENDPOINTS &
  typeof WATCH_AREA_ENDPOINTS &
  typeof TALK_AREA_ENDPOINTS &
  typeof WEATHER_AREA_ENDPOINTS &
  typeof EXCHANGE_RATES_AREA_ENDPOINTS &
  typeof PLACE_AREA_ENDPOINTS &
  typeof SCHEDULE_ENDPOINTS &
  typeof PLUGIN_ENDPOINTS &
  typeof PHONE_AREA_ENDPOINTS &
  typeof SIGNAL_ENDPOINTS &
  typeof REACH_ENDPOINTS &
  typeof CALL_ENDPOINTS &
  typeof TRANSCRIPT_ENDPOINTS &
  typeof ASSISTANT_AREA_ENDPOINTS &
  typeof AI_CHAT_AREA_ENDPOINTS &
  typeof AI_COORDINATION_ENDPOINTS &
  typeof ASSISTANT_VOICE_ENDPOINTS &
  typeof AI_USAGE_ENDPOINTS &
  typeof AI_BUDGET_ENDPOINTS &
  typeof CLAUDE_CLI_ENDPOINTS &
  typeof CLAUDE_ENDPOINTS &
  typeof COMPUTER_ENDPOINTS &
  typeof COMPUTER_AI_ENDPOINTS &
  typeof COMPUTER_NODE_ENDPOINTS &
  typeof COMPUTER_SESSION_ENDPOINTS;

export const API_ENDPOINTS: ApiEndpointRegistry = {
  ...DEVICE_GROUP_ENDPOINTS,
  ...DEVICE_EFFECT_ENDPOINTS,
  ...AI_REFERENCE_ENDPOINTS,
  ...AI_PROJECT_ENDPOINTS,
  ...AI_NATIVE_COMMAND_ENDPOINTS,
  ...AI_PREVIEW_ENDPOINTS,
  ...AI_HARNESS_COMMAND_ENDPOINTS,
  ...AI_HARNESS_EXTENSION_ENDPOINTS,
  ...IMAGE_AREA_ENDPOINTS,
  ...AI_HARNESS_ENDPOINTS,
  ...AI_HARNESS_CONFIGURATION_ENDPOINTS,
  ...AI_PROVIDER_ENDPOINTS,
  ...COMPUTER_RUNTIME_ENDPOINTS,
  ...AI_AGENT_RUN_ENDPOINTS,
  ...AI_MODEL_ENDPOINTS,
  ...ACCESS_ENDPOINTS,
  ...CONNECTION_ENDPOINTS,
  ...CLIENT_FAILURE_ENDPOINTS,
  ...SNAPSHOT_ENDPOINTS,
  ...SETTINGS_AREA_ENDPOINTS,
  ...DEVICE_AREA_ENDPOINTS,
  ...MEDIA_ENDPOINTS,
  ...FIREWALL_ENDPOINTS,
  ...AUTOMATION_AREA_ENDPOINTS,
  ...HEALTH_AREA_ENDPOINTS,
  ...MCP_ACCESS_ENDPOINTS,
  ...PEOPLE_AREA_ENDPOINTS,
  ...NUTRITION_AREA_ENDPOINTS,
  ...WATCH_AREA_ENDPOINTS,
  ...TALK_AREA_ENDPOINTS,
  ...WEATHER_AREA_ENDPOINTS,
  ...EXCHANGE_RATES_AREA_ENDPOINTS,
  ...PLACE_AREA_ENDPOINTS,
  ...SCHEDULE_ENDPOINTS,
  ...PLUGIN_ENDPOINTS,
  ...PHONE_AREA_ENDPOINTS,
  ...SIGNAL_ENDPOINTS,
  ...REACH_ENDPOINTS,
  ...CALL_ENDPOINTS,
  ...TRANSCRIPT_ENDPOINTS,
  ...ASSISTANT_AREA_ENDPOINTS,
  ...AI_CHAT_AREA_ENDPOINTS,
  ...AI_COORDINATION_ENDPOINTS,
  ...ASSISTANT_VOICE_ENDPOINTS,
  ...AI_USAGE_ENDPOINTS,
  ...AI_BUDGET_ENDPOINTS,
  ...CLAUDE_CLI_ENDPOINTS,
  ...CLAUDE_ENDPOINTS,
  ...COMPUTER_ENDPOINTS,
  ...COMPUTER_AI_ENDPOINTS,
  ...COMPUTER_NODE_ENDPOINTS,
  ...COMPUTER_SESSION_ENDPOINTS,
} as const;

export type ApiEndpoints = typeof API_ENDPOINTS;

export type EndpointName = keyof ApiEndpoints;

export type ParamsOf<N extends EndpointName> = z.output<ApiEndpoints[N]['params']>;

export type QueryOf<N extends EndpointName> = z.output<ApiEndpoints[N]['query']>;

export type BodyOf<N extends EndpointName> = z.output<ApiEndpoints[N]['body']>;

export type RequestBodyOf<N extends EndpointName> = z.input<ApiEndpoints[N]['body']>;

export type ResponseOf<N extends EndpointName> = z.output<ApiEndpoints[N]['response']>;

export type ResponseInputOf<N extends EndpointName> = z.input<ApiEndpoints[N]['response']>;
