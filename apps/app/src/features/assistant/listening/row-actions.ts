import type { ListeningRow } from './listening-model';

export interface RowActions {
  readonly offline: boolean;
  readonly onOpen: (key: string) => void;
  readonly onChange: (row: ListeningRow, key: 'wake' | 'transcribe', value: boolean) => void;
}
