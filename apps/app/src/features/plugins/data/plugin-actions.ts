import type { PluginRow } from '@smarteverything/domain';
import {
  removePlugin,
  restartPlugin,
  updatePlugin,
  type PluginEdit,
} from '../../../api/plugin-admin';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';

function failed(message: string): (error: unknown) => void {
  return (error) => {
    notify({ message, error, tone: 'critical' });
  };
}

async function saveConfirmed(row: PluginRow, edit: PluginEdit): Promise<void> {
  const first = await updatePlugin(row.id, edit, false);
  if (first.outcome === 'saved') {
    return;
  }
  const accepted = await confirm({
    title: `Switch on ${row.manifest.name}?`,
    body: [`It will be able to:`, ...first.powers.map((power) => `• ${power}`)].join('\n'),
    confirmLabel: 'Switch on',
  });
  if (accepted) {
    await updatePlugin(row.id, edit, true);
  }
}

export function savePlugin(row: PluginRow, edit: PluginEdit, failure: string): Promise<void> {
  return saveConfirmed(row, edit).catch(failed(failure));
}

export function switchPlugin(row: PluginRow, on: boolean): Promise<void> {
  return savePlugin(
    row,
    { enabled: on },
    on ? `${row.manifest.name} didn’t switch on` : `${row.manifest.name} didn’t switch off`,
  );
}

export function restart(row: PluginRow): void {
  restartPlugin(row.id).then(
    () => {
      notify({ message: `Restarting ${row.manifest.name}` });
    },
    failed(`${row.manifest.name} didn’t restart`),
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
    return false;
  }
  return removePlugin(row.id).then(
    () => true,
    (error: unknown) => {
      failed(`${row.manifest.name} wasn’t removed`)(error);
      return false;
    },
  );
}
