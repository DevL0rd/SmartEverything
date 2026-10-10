import { useQueryClient } from '@tanstack/react-query';
import type { PluginPerson, PluginPersonChange, PluginRow } from '@smarteverything/domain';
import { forgetPluginPerson, savePluginPerson } from '../../../api/plugin-admin';
import { confirm } from '../../../components/confirm-store';
import { notify } from '../../../components/toast-store';
import { pluginKey } from '../../../queries/keys';

export interface PluginPeopleActions {
  readonly save: (externalId: string, change: PluginPersonChange) => Promise<void>;
  readonly forget: (person: PluginPerson) => Promise<boolean>;
}

export function usePluginPeopleActions(row: PluginRow): PluginPeopleActions {
  const client = useQueryClient();
  const refresh = (): void => {
    void client.invalidateQueries({ queryKey: pluginKey(row.id, 'people') });
  };
  return {
    save: async (externalId, change): Promise<void> => {
      await savePluginPerson(row.id, externalId, change);
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
      try {
        await forgetPluginPerson(row.id, person.external_id);
        refresh();
        return true;
      } catch (error) {
        notify({ message: `${person.name} wasn’t removed`, error, tone: 'critical' });
        return false;
      }
    },
  };
}
