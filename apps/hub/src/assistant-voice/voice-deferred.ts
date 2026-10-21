import { appendTo } from '@smarteverything/domain';
import type { HubTool } from '../ai-tools/hub-tool';
import { COMMON_TOOL_NAMES, indexedTools } from '../ai-tools/tool-sets';

export const VOICE_DEFERRED_TOOLS: ReadonlySet<string> = new Set(['health_read', 'food_log']);

const VOICE_DECLARED_TOOLS: ReadonlySet<string> = new Set(
  [...COMMON_TOOL_NAMES].filter((name) => !VOICE_DEFERRED_TOOLS.has(name)),
);

export function voiceToolIndex(enabled: readonly HubTool[]): string {
  const areas = new Map<string, string[]>();
  for (const tool of indexedTools(enabled, VOICE_DECLARED_TOOLS)) {
    appendTo(areas, tool.area, tool.name);
  }
  return [...areas]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, names]) => `${area}: ${names.join(', ')}`)
    .join('\n');
}
