import {
  API_ENDPOINTS as E,
  type PluginDataPoint,
  type PluginId,
  type PluginToolOutcome,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.plugins');

export async function callPluginTool(
  pluginId: PluginId,
  tool: string,
  args: Readonly<Record<string, unknown>>,
): Promise<PluginToolOutcome> {
  const outcome = await api().call(E.callPluginTool, {
    params: { pluginId, tool },
    body: { arguments: { ...args } },
  });
  log.info('plugin.tool_called', { pluginId, tool, outcome: outcome.outcome });
  return outcome;
}

export function readPluginStreamHistory(
  pluginId: PluginId,
  stream: string,
  limit: number,
): Promise<PluginDataPoint[]> {
  return api().call(E.readPluginData, { params: { pluginId }, query: { stream, limit } });
}
