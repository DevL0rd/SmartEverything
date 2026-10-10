import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PluginLogLine, PluginRow, PluginToolRow } from '@smarteverything/domain';
import { readPluginLog, readPluginTools } from '../../../api/plugin-admin';
import { pluginKey } from '../../../queries/keys';

export function usePluginTools(row: PluginRow): UseQueryResult<PluginToolRow[]> {
  return useQuery({
    queryKey: pluginKey(row.id, 'tools'),
    queryFn: () => readPluginTools(row.id),
    enabled: row.status === 'running',
  });
}

export function usePluginLog(row: PluginRow): UseQueryResult<PluginLogLine[]> {
  return useQuery({
    queryKey: pluginKey(row.id, 'log'),
    queryFn: () => readPluginLog(row.id),
  });
}
