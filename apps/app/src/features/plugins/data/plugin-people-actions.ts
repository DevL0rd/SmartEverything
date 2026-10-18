import { useQueryClient } from '@tanstack/react-query';
import type { PluginPerson, PluginPersonChange, PluginRow } from '@smarteverything/domain';
import { forgetPluginPerson, savePluginPerson } from '../../../api/plugin-admin';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { pluginKey } from '../../../queries/keys';

import { Logger, background } from '@smarteverything/logging';

const log = new Logger('app.plugins');
export interface PluginPeopleActions {
  readonly save: (externalId: string, change: PluginPersonChange) => Promise<void>;
  readonly forget: (person: PluginPerson) => Promise<boolean>;
}

export function usePluginPeopleActions(row: PluginRow): PluginPeopleActions {
  const client = useQueryClient();
  const refresh = (): void => {
    background(
      client.invalidateQueries({ queryKey: pluginKey(row.id, 'people') }),
      'queries.invalidate_failed',
    );
  };
  return {
    save: async (externalId, change): Promise<void> => {
      const operation = log.operation('plugin_person.save', { pluginId: row.id });
      try {
        await savePluginPerson(row.id, externalId, change);
        operation.succeeded();
      } catch (error) {
        operation.failed(error);
        throw error;
      }
      refresh();
    },
    forget: async (person): Promise<boolean> => {
      const accepted = await confirm({
        title: `Remove ${person.name}?`,
        body: `They can no longer act through ${row.manifest.name}.`,
        confirmLabel: 'Remove',
        tone: 'destructive',
      });
      if (!accepted) {
        return false;
      }
      const operation = log.operation('plugin_person.forget', { pluginId: row.id });
      try {
        await forgetPluginPerson(row.id, person.external_id);
        operation.succeeded();
        refresh();
        return true;
      } catch (error) {
        operation.failed(error);
        notify({ message: `${person.name} wasn’t removed`, error, tone: 'critical' });
        return false;
      }
    },
  };
}
