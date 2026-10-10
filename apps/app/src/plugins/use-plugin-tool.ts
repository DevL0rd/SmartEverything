import { useMemo } from 'react';
import type { PluginId } from '@smarteverything/domain';
import { callPluginTool } from '../api/plugins';
import { confirm } from '../components/confirm-store';
import { notify } from '../components/toast-store';

export type PluginToolResult = Readonly<Record<string, unknown>>;

export interface PluginToolRunner {
  readonly run: (
    tool: string,
    args: Readonly<Record<string, unknown>>,
  ) => Promise<PluginToolResult | null>;
}

async function runConfirmed(
  pluginId: PluginId,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<PluginToolResult | null> {
  const first = await callPluginTool(pluginId, tool, args, false);
  if (first.outcome === 'done') {
    return first.result;
  }
  const accepted = await confirm({
    title: first.reason,
    confirmLabel: 'Go ahead',
    tone: 'destructive',
  });
  if (!accepted) {
    return null;
  }
  const second = await callPluginTool(pluginId, tool, args, true);
  return second.outcome === 'done' ? second.result : null;
}

async function runSafely(
  pluginId: PluginId,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<PluginToolResult | null> {
  try {
    return await runConfirmed(pluginId, tool, args);
  } catch (error) {
    notify({ message: 'That did not work', error, tone: 'critical' });
    return null;
  }
}

export function usePluginTool(pluginId: PluginId): PluginToolRunner {
  return useMemo(() => ({ run: (tool, args) => runSafely(pluginId, tool, args) }), [pluginId]);
}
