import type { AiModelSearchRequest, PlannerStatsRange } from '@smarteverything/domain';

export const WINDOW_PREFIX = ['window'] as const;

export const HEALTH_PREFIX = ['window', 'health'] as const;

export const HISTORY_PREFIX = ['window', 'history'] as const;

export function historyKey(
  capabilities: readonly string[],
  sinceHours: number,
): readonly ['window', 'history', string, number] {
  return [...HISTORY_PREFIX, capabilities.join(','), sinceHours];
}

export function deviceHistoryKey(
  deviceId: string,
  capability: string,
  sinceHours: number,
): readonly ['window', 'history', string, number, string] {
  return [...HISTORY_PREFIX, capability, sinceHours, deviceId];
}

export function deviceHistoryBucketsKey(
  deviceId: string,
  capability: string,
  sinceHours: number,
): readonly ['window', 'history-buckets', string, string, number] {
  return ['window', 'history-buckets', deviceId, capability, sinceHours];
}

export const SMARTTHINGS_APP_KEY = ['window', 'smartthings-app'] as const;

export const SERVICE_LOG_TAIL_KEY = ['window', 'service-log-tail'] as const;

export const START_ON_LOGIN_KEY = ['window', 'start-on-login'] as const;

export const WATCH_CANDIDATES_KEY = ['window', 'watch-candidates'] as const;

export const IR_LIBRARY_PREFIX = ['window', 'ir-library'] as const;

export function irLibraryKey(
  ...path: readonly string[]
): readonly ['window', 'ir-library', ...string[]] {
  return [...IR_LIBRARY_PREFIX, ...path];
}

export function watchDaysKey(
  from: string,
  to: string,
): readonly ['window', 'health', 'watch-days', string, string] {
  return [...HEALTH_PREFIX, 'watch-days', from, to];
}

export const CAMERA_LIST_KEY = ['window', 'camera-list'] as const;

export function cameraSnapshotKey(
  deviceId: string,
  size?: string,
):
  | readonly ['window', 'camera-snapshot', string]
  | readonly ['window', 'camera-snapshot', string, string] {
  return size === undefined
    ? ['window', 'camera-snapshot', deviceId]
    : ['window', 'camera-snapshot', deviceId, size];
}

export function recordingLinksKey(
  ids: readonly string[],
  size: string,
): readonly ['window', 'recording-links', string, string] {
  return ['window', 'recording-links', [...ids].sort().join(','), size];
}

export const PUSH_STATUS_KEY = ['window', 'push-status'] as const;

export const WATCH_CAPTURES_KEY = ['window', 'watch-captures'] as const;

export const DEVICE_EFFECTS_KEY = ['window', 'device-effects'] as const;

export const DEVICE_LOG_PREFIX = ['window', 'device-log'] as const;

export function deviceLogKey(
  deviceId: string,
  shape: number | 'pages',
): readonly ['window', 'device-log', string, number | 'pages'] {
  return [...DEVICE_LOG_PREFIX, deviceId, shape];
}

export function assistantLinksKey(
  ids: readonly string[],
): readonly ['window', 'assistant-links', string] {
  return ['window', 'assistant-links', ids.join(',')];
}

export const AI_USAGE_PREFIX = ['window', 'ai-usage'] as const;

export const CHAT_METER_HISTORY_PREFIX = ['window', 'ai-chat-meter-history'] as const;

export function chatMeterHistoryKey(chatId: string): readonly string[] {
  return [...CHAT_METER_HISTORY_PREFIX, chatId];
}

export const REACH_PREFIX = ['window', 'reach'] as const;

export const ACCESS_PREFIX = ['window', 'access'] as const;

export const OPENROUTER_ACCOUNT_KEY = ['window', 'openrouter', 'account'] as const;

export const AI_MODELS_PREFIX = ['window', 'ai-models'] as const;

export const aiModelsKeys = {
  detailed: (
    session: string,
    query: Omit<AiModelSearchRequest, 'cursor' | 'limit' | 'gone'>,
  ): readonly unknown[] => [...AI_MODELS_PREFIX, 'detailed', session, query, 30],
  suggested: (kind: string, current: string | null): readonly string[] => [
    ...AI_MODELS_PREFIX,
    'suggested',
    kind,
    current ?? '',
  ],
  search: (kind: string, query: string): readonly string[] => [
    ...AI_MODELS_PREFIX,
    'search',
    kind,
    query,
  ],
  providers: (kind: string): readonly string[] => [...AI_MODELS_PREFIX, 'providers', kind],
  provider: (kind: string, provider: string): readonly string[] => [
    ...AI_MODELS_PREFIX,
    'provider',
    kind,
    provider,
  ],
  one: (id: string): readonly string[] => [...AI_MODELS_PREFIX, 'one', id],
};

export const PLUGIN_PREFIX = ['window', 'plugins'] as const;

export function pluginOptionsKey(
  pluginId: string,
  source: string,
  rest: readonly string[],
): readonly string[] {
  return [...PLUGIN_PREFIX, pluginId, 'options', source, ...rest];
}

export function pluginKey(
  pluginId: string,
  part: 'tools' | 'log' | 'people',
): readonly ['window', 'plugins', string, 'tools' | 'log' | 'people'] {
  return [...PLUGIN_PREFIX, pluginId, part];
}

const TRANSCRIPT_PREFIX = ['window', 'transcripts'] as const;

export const transcriptKeys = {
  settings: (): readonly string[] => [...TRANSCRIPT_PREFIX, 'settings'],
  status: (cameraId?: string): readonly string[] => [
    ...TRANSCRIPT_PREFIX,
    'status',
    ...(cameraId === undefined ? [] : [cameraId]),
  ],
};

export const ARCHIVED_CHATS_KEY = ['window', 'ai-chats', 'archived'] as const;

export function chatSearchKey(
  text: string,
  archived: boolean,
): readonly ['window', 'ai-chats', 'search', string, boolean] {
  return ['window', 'ai-chats', 'search', text, archived];
}

export function providerKey(chatId: string): readonly string[] {
  return ['window', 'ai-provider', chatId];
}

export const AGENT_RUN_PREFIX = ['window', 'ai-agents'] as const;

export function targetHistoryKey(
  deviceIds: readonly string[],
  window: string,
): readonly ['window', 'history', 'target', string, string] {
  return [...HISTORY_PREFIX, 'target', deviceIds.join(','), window];
}

export function computerAiKey(deviceId: string): readonly string[] {
  return ['window', 'computer-ai', deviceId];
}

export const PLANNER_PREFIX = ['window', 'planner'] as const;

export type PlannerKind = 'day' | 'range' | 'stats' | 'rings';

export const plannerKeys = {
  day: (personId: string | null, date: string): readonly unknown[] => [
    ...PLANNER_PREFIX,
    'day',
    personId,
    date,
  ],
  range: (
    personId: string | null,
    from: string,
    to: string,
    collections: readonly string[] | null,
  ): readonly unknown[] => [
    ...PLANNER_PREFIX,
    'range',
    personId,
    from,
    to,
    collections === null ? null : [...collections].sort().join(','),
  ],
  stats: (personId: string | null, range: PlannerStatsRange): readonly unknown[] => [
    ...PLANNER_PREFIX,
    'stats',
    personId,
    range,
  ],
  rings: (personId: string | null, from: string, to: string): readonly unknown[] => [
    ...PLANNER_PREFIX,
    'rings',
    personId,
    from,
    to,
  ],
  preferences: (personId: string | null): readonly unknown[] => [
    ...PLANNER_PREFIX,
    'preferences',
    personId,
  ],
  prefix: (kind: PlannerKind): readonly unknown[] => [...PLANNER_PREFIX, kind],
};

export const DRIVE_PREFIX = ['window', 'drive'] as const;

export const DRIVE_WINDOW_KINDS = [
  'folder',
  'item',
  'search',
  'recent',
  'stats',
  'duplicates',
  'album-items',
  'trash',
  'versions',
  'item-activity',
  'activity',
  'shares',
  'usage',
  'health',
  'conflicts',
  'settings',
  'quotas',
  'backup',
  'volumes',
  'photo-buckets',
  'photo-rail-counts',
  'photo-cover',
  'photo-month',
  'photo-media',
  'photo-processing',
  'photo-memories',
  'photo-memory-items',
  'photo-trips',
  'photo-places',
  'photo-place',
  'photo-clusters',
  'photo-insights',
  'photo-stacks',
  'photo-stack',
  'photo-sources',
  'photo-backup',
  'photo-search',
  'photo-duplicates',
  'photo-duplicate-stats',
] as const;

export type DriveWindowKind = (typeof DRIVE_WINDOW_KINDS)[number];

export interface DriveWindowScope {
  readonly rootId: string | null;
  readonly folderId: string | null;
  readonly albumId: string | null;
}

export const DRIVE_EVERYWHERE: DriveWindowScope = { rootId: null, folderId: null, albumId: null };

export function driveKey(
  kind: DriveWindowKind,
  scope: DriveWindowScope | null,
  ...params: readonly unknown[]
): readonly unknown[] {
  return [...DRIVE_PREFIX, kind, scope, ...params];
}
