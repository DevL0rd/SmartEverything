import { useMemo } from 'react';
import type { PluginId } from '@smarteverything/domain';
import { callPluginTool } from '../api/plugins';
import { notify } from '../components/toast-store';

import type { z } from 'zod';
import { failureKind, pluginLog as log } from './shared/plugin-log';

export type PluginToolResult = Readonly<Record<string, unknown>>;

type PluginToolArgs = Readonly<Record<string, unknown>>;

export interface PluginToolRunner {
  readonly run: (
    tool: string,
    args: PluginToolArgs,
    failure: string,
  ) => Promise<PluginToolResult | null>;
}

export async function readPluginTool(
  pluginId: PluginId,
  tool: string,
  args: PluginToolArgs,
): Promise<PluginToolResult> {
  const startedAt = Date.now();
  log.debug('plugin_tool.started', () => ({ pluginId, tool, argKeys: Object.keys(args).length }));
  try {
    const outcome = await callPluginTool(pluginId, tool, args);
    log.debug('plugin_tool.finished', () => ({
      pluginId,
      tool,
      outcome: outcome.outcome,
      durationMs: Date.now() - startedAt,
    }));
    return outcome.result;
  } catch (error) {
    log.warn('plugin_tool.failed', {
      pluginId,
      tool,
      durationMs: Date.now() - startedAt,
      ...failureKind(error),
    });
    throw error;
  }
}

export function parsePluginReply<T>(
  pluginId: PluginId,
  tool: string,
  schema: z.ZodType<T>,
  reply: unknown,
): T {
  const result = schema.safeParse(reply);
  if (result.success) return result.data;
  log.warn('plugin_tool.reply_invalid', {
    pluginId,
    tool,
    issues: result.error.issues.length,
    firstIssue: result.error.issues[0]?.message ?? '',
    firstPath: result.error.issues[0]?.path.map(String).join('.') ?? '',
  });
  throw result.error;
}

async function runSafely(
  pluginId: PluginId,
  tool: string,
  args: PluginToolArgs,
  failure: string,
): Promise<PluginToolResult | null> {
  try {
    return await readPluginTool(pluginId, tool, args);
  } catch (error) {
    log.debug('plugin_tool.surfaced', () => ({ pluginId, tool, ...failureKind(error) }));
    notify({ message: failure, error, tone: 'critical' });
    return null;
  }
}

export function usePluginTool(pluginId: PluginId): PluginToolRunner {
  return useMemo(
    () => ({ run: (tool, args, failure) => runSafely(pluginId, tool, args, failure) }),
    [pluginId],
  );
}
