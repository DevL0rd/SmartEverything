import type { WebSource } from '@smarteverything/domain';

export const WEB_SEARCH_MAX_RESULTS = 5;

export const OPENROUTER_WEB_SEARCH_TOOL = {
  type: 'openrouter:web_search',
  parameters: { engine: 'auto', max_results: WEB_SEARCH_MAX_RESULTS },
} as const;

export const LIVE_WEB_SEARCH_TOOL = { googleSearch: {} } as const;

export function mergedSources(
  kept: readonly WebSource[],
  added: readonly WebSource[],
): readonly WebSource[] {
  const byUrl = new Map<string, WebSource>();
  [...kept, ...added].forEach((source) => {
    if (!byUrl.has(source.url)) {
      byUrl.set(source.url, source);
    }
  });
  return [...byUrl.values()];
}
