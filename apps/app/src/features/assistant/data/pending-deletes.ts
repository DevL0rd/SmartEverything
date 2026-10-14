import type { AssistantMessageRow } from '@smarteverything/domain';
import { removeAssistantMessage } from '../../../api/assistant';
import { notify } from '../../../components/toast-store';
import { ValueStore, useValue } from '../../../design/external-store';

const hidden = new ValueStore<ReadonlySet<string>>(new Set());

export function usePendingDeletes(): ReadonlySet<string> {
  return useValue(hidden);
}

function hide(id: string): void {
  hidden.update((current) => new Set([...current, id]));
}

function restore(id: string): void {
  hidden.update((current) => new Set([...current].filter((known) => known !== id)));
}

async function commit(id: string): Promise<void> {
  try {
    await removeAssistantMessage(id);
  } catch (error) {
    notify({ message: 'Message not deleted', error, tone: 'critical' });
    restore(id);
  }
}

export function deleteMessageWithUndo(row: AssistantMessageRow): void {
  hide(row.id);
  notify({
    message: 'Message deleted',
    action: {
      label: 'Undo',
      onPress: () => {
        restore(row.id);
      },
    },
    onDismissed: () => {
      void commit(row.id);
    },
  });
}
