import { background } from '@smarteverything/logging';
import type { ListeningSourceChange } from '@smarteverything/domain';
import { useListeningChange } from './listening-data';
import { switchable, type ListeningGroup, type ListeningRow } from './listening-model';
import type { RowActions } from './row-actions';

export type SwitchKey = 'wake' | 'transcribe';

export interface ListeningActions {
  readonly rows: RowActions;
  readonly onAll: (group: ListeningGroup, key: SwitchKey, value: boolean) => void;
  readonly onSheet: (row: ListeningRow, change: ListeningSourceChange) => void;
}

function changeOf(key: SwitchKey, value: boolean): ListeningSourceChange {
  return key === 'wake' ? { wake: value } : { transcribe: value };
}

export function useListeningActions(
  offline: boolean,
  open: (key: string) => void,
): ListeningActions {
  const change = useListeningChange();
  const send = (row: ListeningRow, patch: ListeningSourceChange): void => {
    background(change(row.source.key, patch, row.source.name), 'listening.change_failed');
  };
  return {
    rows: {
      offline,
      onOpen: open,
      onChange: (row, key, value): void => {
        send(row, changeOf(key, value));
      },
    },
    onAll: (group, key, value): void => {
      for (const row of group.rows.filter(switchable)) send(row, changeOf(key, value));
    },
    onSheet: send,
  };
}
