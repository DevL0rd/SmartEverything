import {
  API_ENDPOINTS as E,
  type JsonValue,
  type PluginId,
  type PluginInstall,
  type PluginLogLine,
  type PluginRow,
  type PluginSaved,
  type PluginToolRow,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from './transport';

const log = new Logger('app.plugin-admin');

export interface PluginEdit {
  readonly enabled?: boolean;
  readonly trusted?: boolean;
  readonly tool_switches?: Readonly<Record<string, boolean>>;
  readonly settings?: Readonly<Record<string, JsonValue>>;
}

export async function installPlugin(install: PluginInstall): Promise<PluginRow> {
  const row = await api().call(E.installPlugin, { body: install });
  log.info('plugin.installed', { pluginId: row.id, source: install.source });
  return row;
}

export async function updatePlugin(
  pluginId: PluginId,
  edit: PluginEdit,
  confirm: boolean,
): Promise<PluginSaved> {
  const saved = await api().call(E.updatePlugin, {
    params: { pluginId },
    body: { ...edit, confirm },
  });
  log.info('plugin.updated', { pluginId, outcome: saved.outcome });
  return saved;
}

export async function restartPlugin(pluginId: PluginId): Promise<void> {
  await api().call(E.restartPlugin, { params: { pluginId } });
  log.info('plugin.restarted', { pluginId });
}

export async function removePlugin(pluginId: PluginId): Promise<void> {
  await api().call(E.removePlugin, { params: { pluginId } });
  log.info('plugin.removed', { pluginId });
}

export function readPluginTools(pluginId: PluginId): Promise<PluginToolRow[]> {
  return api().call(E.readPluginTools, { params: { pluginId } });
}

export function readPluginLog(pluginId: PluginId): Promise<PluginLogLine[]> {
  return api().call(E.readPluginLog, { params: { pluginId } });
}
