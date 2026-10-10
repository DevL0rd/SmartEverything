import {
  API_ENDPOINTS as E,
  type JsonValue,
  type PluginId,
  type PluginInstall,
  type PluginLogLine,
  type PluginOptionPage,
  type PluginOptionQuery,
  type PluginPerson,
  type PluginPersonChange,
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

export async function updatePlugin(pluginId: PluginId, edit: PluginEdit): Promise<PluginSaved> {
  const saved = await api().call(E.updatePlugin, {
    params: { pluginId },
    body: edit,
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

export function readPluginOptions(
  pluginId: PluginId,
  source: string,
  query: PluginOptionQuery,
): Promise<PluginOptionPage> {
  return api().call(E.readPluginOptions, { params: { pluginId, source }, query });
}

export function readPluginPeople(pluginId: PluginId): Promise<PluginPerson[]> {
  return api().call(E.listPluginPeople, { params: { pluginId } });
}

export async function savePluginPerson(
  pluginId: PluginId,
  externalId: string,
  change: PluginPersonChange,
): Promise<PluginPerson> {
  const person = await api().call(E.setPluginPerson, {
    params: { pluginId, externalId },
    body: change,
  });
  log.info('plugin.person_saved', { pluginId, status: change.status });
  return person;
}

export async function forgetPluginPerson(pluginId: PluginId, externalId: string): Promise<void> {
  await api().call(E.removePluginPerson, { params: { pluginId, externalId } });
  log.info('plugin.person_removed', { pluginId });
}
