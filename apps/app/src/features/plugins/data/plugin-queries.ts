import { type UseQueryResult } from '@tanstack/react-query';
import type {
  PluginLogLine,
  PluginPerson,
  PluginRow,
  PluginToolRow,
} from '@smarteverything/domain';
import { readPluginLog, readPluginPeople, readPluginTools } from '../../../api/plugin-admin';
import { naturalCompare } from '../../../format/text';
import { pluginKey } from '../../../queries/keys';
import { useScreenQuery } from '../../../queries/use-screen-query';

export function usePluginTools(row: PluginRow): UseQueryResult<PluginToolRow[]> {
  return useScreenQuery({
    queryKey: pluginKey(row.id, 'tools'),
    queryFn: () => readPluginTools(row.id),
    enabled: row.status === 'running',
  });
}

export function usePluginLog(row: PluginRow): UseQueryResult<PluginLogLine[]> {
  return useScreenQuery({
    queryKey: pluginKey(row.id, 'log'),
    queryFn: () => readPluginLog(row.id),
  });
}

export function usePluginPeople(row: PluginRow): UseQueryResult<PluginPerson[]> {
  return useScreenQuery({
    queryKey: pluginKey(row.id, 'people'),
    queryFn: () => readPluginPeople(row.id),
    select: (people) => [...people].sort((a, b) => naturalCompare(a.name, b.name)),
  });
}
