import { notify } from '../../../../components/toast-store';
import { updateAssistantSettings } from '../../../../api/assistant';
import type { EntityStore } from '../../../../store/entity-store';
import { useEntityStore } from '../../../../store/store-context';
import { useAssistantName, useAssistantStatus } from '../../data/assistant-data';

export interface Aliases {
  readonly name: string;
  readonly aliases: readonly string[];
  readonly add: (alias: string) => void;
  readonly remove: (alias: string) => void;
}

async function save(store: EntityStore, aliases: readonly string[]): Promise<void> {
  const status = await updateAssistantSettings({ aliases: [...aliases] });
  store.update((state) => ({ ...state, assistant: status }));
}

function change(
  store: EntityStore,
  edit: { readonly from: readonly string[]; readonly to: readonly string[]; readonly done: string },
): void {
  save(store, edit.to)
    .then(() => {
      notify({
        message: edit.done,
        tone: 'positive',
        undo: () => {
          change(store, { from: edit.to, to: edit.from, done: 'Change undone' });
        },
      });
    })
    .catch((error: unknown) => {
      notify({ message: 'The names were not changed', error, tone: 'critical' });
    });
}

export function useAliases(): Aliases {
  const store = useEntityStore();
  const name = useAssistantName();
  const aliases = useAssistantStatus()?.settings.aliases ?? [];
  return {
    name,
    aliases,
    add: (alias: string): void => {
      change(store, {
        from: aliases,
        to: [...aliases, alias],
        done: `Now also answers to “${alias}”`,
      });
    },
    remove: (alias: string): void => {
      change(store, {
        from: aliases,
        to: aliases.filter((one) => one !== alias),
        done: `No longer answers to “${alias}”`,
      });
    },
  };
}
