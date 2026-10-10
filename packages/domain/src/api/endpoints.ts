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
import { AUTOMATION_AREA_ENDPOINTS } from './endpoints-automation';
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
import { PLACE_AREA_ENDPOINTS } from './endpoints-places';
import { SCHEDULE_ENDPOINTS } from './endpoints-schedules';
import { PLUGIN_ENDPOINTS } from './endpoints-plugins';
import { PHONE_AREA_ENDPOINTS } from './endpoints-phones';
import { SIGNAL_ENDPOINTS } from './endpoints-signals';
import { REACH_ENDPOINTS } from './endpoints-reach';

export const API_ENDPOINTS = {
  ...AI_MODEL_ENDPOINTS,
  ...ACCESS_ENDPOINTS,
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
  ...PLACE_AREA_ENDPOINTS,
  ...SCHEDULE_ENDPOINTS,
  ...PLUGIN_ENDPOINTS,
  ...PHONE_AREA_ENDPOINTS,
  ...SIGNAL_ENDPOINTS,
  ...REACH_ENDPOINTS,
  ...ASSISTANT_AREA_ENDPOINTS,
  ...AI_CHAT_AREA_ENDPOINTS,
  ...AI_COORDINATION_ENDPOINTS,
  ...ASSISTANT_VOICE_ENDPOINTS,
  ...AI_USAGE_ENDPOINTS,
  ...AI_BUDGET_ENDPOINTS,
  ...COMPUTER_ENDPOINTS,
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
