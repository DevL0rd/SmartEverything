export const HEALTH_PREFIX = ['window', 'health'] as const;

export const HISTORY_PREFIX = ['window', 'history'] as const;

export function historyKey(
  capabilities: readonly string[],
  sinceHours: number,
): readonly ['window', 'history', string, number] {
  return [...HISTORY_PREFIX, capabilities.join(','), sinceHours];
}

export const SMARTTHINGS_APP_KEY = ['window', 'smartthings-app'] as const;

export const SERVICE_LOG_TAIL_KEY = ['window', 'service-log-tail'] as const;

export const FFMPEG_KEY = ['window', 'ffmpeg'] as const;

export const WATCH_CANDIDATES_KEY = ['window', 'watch-candidates'] as const;

export function watchDaysKey(
  from: string,
  to: string,
): readonly ['window', 'health', 'watch-days', string, string] {
  return [...HEALTH_PREFIX, 'watch-days', from, to];
}

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

export const AUTOMATION_RUNS_KEY = ['window', 'automation-runs'] as const;

export function assistantLinksKey(
  ids: readonly string[],
): readonly ['window', 'assistant-links', string] {
  return ['window', 'assistant-links', ids.join(',')];
}

export const AI_USAGE_PREFIX = ['window', 'ai-usage'] as const;

export const REACH_PREFIX = ['window', 'reach'] as const;

export const OPENROUTER_ACCOUNT_KEY = ['window', 'openrouter', 'account'] as const;

export const AI_MODELS_PREFIX = ['window', 'ai-models'] as const;

export const aiModelsKeys = {
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

export function engineModelsKey(kind: string): readonly ['window', 'engine-models', string] {
  return ['window', 'engine-models', kind];
}

export const PLUGIN_PREFIX = ['window', 'plugins'] as const;

export function pluginKey(
  pluginId: string,
  part: 'tools' | 'log',
): readonly ['window', 'plugins', string, 'tools' | 'log'] {
  return [...PLUGIN_PREFIX, pluginId, part];
}
