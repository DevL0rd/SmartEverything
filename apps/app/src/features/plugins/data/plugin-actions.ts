import type { PluginRow } from '@smarteverything/domain';
import {
  removePlugin,
  restartPlugin,
  updatePlugin,
  type PluginEdit,
} from '../../../api/plugin-admin';
import { confirm } from '../../../components/confirm-store';
import { notify, notifyFailure } from '../../../components/toast-store';

import { Logger } from '@smarteverything/logging';

const log = new Logger('app.plugins');
export async function savePlugin(row: Pick<PluginRow, 'id'>, edit: PluginEdit): Promise<void> {
  const operation = log.operation('plugin.update', {
    pluginId: row.id,
    fields: Object.keys(edit).join(','),
  });
  try {
    await updatePlugin(row.id, edit);
    operation.succeeded();
  } catch (error) {
    operation.failed(error);
    throw error;
  }
}

export function changePlugin(
  row: Pick<PluginRow, 'id'>,
  edit: PluginEdit,
  failure: string,
): Promise<void> {
  return savePlugin(row, edit).catch(notifyFailure(failure));
}

export function switchPlugin(row: PluginRow, on: boolean): Promise<void> {
  return changePlugin(
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
