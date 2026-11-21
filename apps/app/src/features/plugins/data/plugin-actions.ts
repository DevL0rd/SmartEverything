import type { QueryClient } from '@tanstack/react-query';
import { PLUGIN_TOOL_ROW, type PluginRow, type PluginToolRow } from '@smarteverything/domain';
import { z } from 'zod';
import {
  removePlugin,
  restartPlugin,
  updatePlugin,
  type PluginEdit,
} from '../../../api/plugin-admin';
import { confirm } from '../../../components/confirm-store';
import { notify, notifyFailure } from '../../../components/toast-store';
import { pluginKey } from '../../../queries/keys';
import { shownTarget, writeShownQueries } from '../../../queries/shown-query';

import { Logger } from '@smarteverything/logging';
import type { EntityStore } from '../../../store/entity-store';
import { liveRowEdit, writeOptimistically } from '../../../store/optimistic';

const log = new Logger('app.plugins');

const PLUGIN_TOOLS = z.array(PLUGIN_TOOL_ROW);

function shownSettings(row: PluginRow, edit: PluginEdit): PluginRow['settings'] {
  if (edit.settings === undefined) return row.settings;
  const declared = row.manifest.contributes.settings;
  const shown = Object.entries(edit.settings).filter(([key]) => {
    const setting = declared[key];
    return !(setting?.type === 'string' && setting.secret);
  });
  return { ...row.settings, ...Object.fromEntries(shown) };
}

export function pluginAfter(row: PluginRow, edit: PluginEdit): PluginRow {
  return {
    ...row,
    ...(edit.enabled === undefined ? {} : { enabled: edit.enabled }),
    ...(edit.trusted === undefined ? {} : { trusted: edit.trusted }),
    tool_switches:
      edit.tool_switches === undefined
        ? row.tool_switches
        : { ...row.tool_switches, ...edit.tool_switches },
    settings: shownSettings(row, edit),
  };
}

export async function savePlugin(
  store: EntityStore,
  row: Pick<PluginRow, 'id'>,
  edit: PluginEdit,
): Promise<void> {
  const current = store.get().tables.plugins.byId[row.id];
  await writeOptimistically(store, {
    event: 'plugin.update',
    edits:
      current === undefined
        ? []
        : [liveRowEdit('plugins', row.id, current, pluginAfter(current, edit))],
    send: () => updatePlugin(row.id, edit),
    fields: { pluginId: row.id, fields: Object.keys(edit).join(',') },
  });
}

export function changePlugin(
  store: EntityStore,
  row: Pick<PluginRow, 'id'>,
  edit: PluginEdit,
  failure: string,
): Promise<void> {
  return savePlugin(store, row, edit).catch(notifyFailure(failure));
}

export function toolsAfter(
  tools: readonly PluginToolRow[],
  name: string,
  enabled: boolean,
): PluginToolRow[] {
  return tools.map((tool) => (tool.name === name ? { ...tool, enabled } : tool));
}

export interface ToolSwitch {
  readonly tool: Pick<PluginToolRow, 'name' | 'title'>;
  readonly on: boolean;
}

export function switchTool(
  store: EntityStore,
  client: QueryClient,
  row: PluginRow,
  { tool, on }: ToolSwitch,
): Promise<void> {
  return writeShownQueries(client, {
    event: 'plugin.tool_switch',
    targets: [
      shownTarget(pluginKey(row.id, 'tools'), PLUGIN_TOOLS, (tools) =>
        toolsAfter(tools, tool.name, on),
      ),
    ],
    send: () => savePlugin(store, row, { tool_switches: { [tool.name]: on } }),
  }).catch(notifyFailure(`${tool.title} wasn’t changed`));
}

export function switchPlugin(store: EntityStore, row: PluginRow, on: boolean): Promise<void> {
  return changePlugin(
    store,
    row,
    { enabled: on },
    on ? `${row.manifest.name} didn’t switch on` : `${row.manifest.name} didn’t switch off`,
  );
}

export function restart(row: PluginRow): void {
  const operation = log.operation('plugin.restart', { pluginId: row.id });
  restartPlugin(row.id).then(
    () => {
      operation.succeeded();
      notify({ message: `Restarting ${row.manifest.name}` });
    },
    (error: unknown) => {
      operation.failed(error);
      notifyFailure(`${row.manifest.name} didn’t restart`)(error);
    },
  );
}

export async function remove(row: PluginRow): Promise<boolean> {
  const accepted = await confirm({
    title: `Remove ${row.manifest.name}?`,
    body: 'Its tools, data and saved keys are deleted.',
    confirmLabel: 'Remove',
    tone: 'destructive',
  });
  if (!accepted) {
    log.debug('plugin.remove_cancelled', { pluginId: row.id });
    return false;
  }
  const operation = log.operation('plugin.remove', { pluginId: row.id });
  return removePlugin(row.id).then(
    () => {
      operation.succeeded();
      return true;
    },
    (error: unknown) => {
      operation.failed(error);
      notifyFailure(`${row.manifest.name} wasn’t removed`)(error);
      return false;
    },
  );
}
