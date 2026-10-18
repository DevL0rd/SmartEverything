import { useState } from 'react';
import type { FileEntry } from '@smarteverything/domain';
import { NOTHING_PICKED, pickedAll, toggled, type Picked } from './selection-model';

export interface Selection {
  readonly picked: Picked;
  readonly paths: ReadonlySet<string>;
  readonly active: boolean;
  readonly entries: readonly FileEntry[];
  readonly toggle: (entry: FileEntry) => void;
  readonly selectAll: (entries: readonly FileEntry[]) => void;
  readonly clear: () => void;
}

export function useSelection(): Selection {
  const [picked, setPicked] = useState<Picked>(NOTHING_PICKED);
  return {
    picked,
    paths: new Set(picked.keys()),
    active: picked.size > 0,
    entries: [...picked.values()],
    toggle: (entry): void => {
      setPicked((current) => toggled(current, entry));
    },
    selectAll: (entries): void => {
      setPicked(pickedAll(entries));
    },
    clear: (): void => {
      setPicked(NOTHING_PICKED);
    },
  };
}
