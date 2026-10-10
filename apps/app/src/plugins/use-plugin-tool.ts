import { useMemo } from 'react';
import type { PluginId } from '@smarteverything/domain';
import { callPluginTool } from '../api/plugins';
import { notify } from '../components/toast-store';

export type PluginToolResult = Readonly<Record<string, unknown>>;

export interface PluginToolRunner {
  readonly run: (
    tool: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<PluginToolResult | null>;
}

async function runSafely(
  pluginId: PluginId,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<PluginToolResult | null> {
  try {
    return (await callPluginTool(pluginId, tool, args)).result;
  } catch (error) {
    notify({ message: 'That did not work', error, tone: 'critical' });
    return null;
  }
}

export function usePluginTool(pluginId: PluginId): PluginToolRunner {
  return useMemo(() => ({ run: (tool, args) => runSafely(pluginId, tool, args) }), [pluginId]);
}
