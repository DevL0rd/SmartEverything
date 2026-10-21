import { MCP_DISCOVERY_TOOLS } from '@smarteverything/domain';
import type { ToolHub } from '../../ai-tools/tool-hub';

export function scopedHub(hub: ToolHub | null, allowed: readonly string[] | null): ToolHub | null {
  if (hub === null || allowed === null) {
    return hub;
  }
  const names = new Set(allowed);
  return hub.restrict((tool) => names.has(tool.name) || MCP_DISCOVERY_TOOLS.has(tool.name));
}
