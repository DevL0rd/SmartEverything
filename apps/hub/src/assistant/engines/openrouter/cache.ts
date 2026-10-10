const AUTOMATIC_TOP_LEVEL = 'anthropic/';

const SESSION_PREFIX = 'smarteverything:';

export function explicitCache(modelId: string): boolean {
  return modelId.startsWith(AUTOMATIC_TOP_LEVEL);
}

export function prefixBreakpoint(modelId: string): boolean {
  return modelId.startsWith(AUTOMATIC_TOP_LEVEL);
}

export function cacheSession(modelId: string): string {
  return `${SESSION_PREFIX}${modelId}`;
}
