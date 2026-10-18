import { createContext, useContext } from 'react';
import type {
  AutomationRow,
  AutomationValueContent,
  AutomationValueRow,
} from '@smarteverything/domain';

export interface ProgramLibrary {
  readonly value: (
    row: AutomationValueRow | null,
    kind: AutomationValueContent['kind'],
    select: (row: AutomationValueRow) => void,
    lockKind?: boolean,
  ) => void;
  readonly reusable: (row: AutomationRow | null, select: (row: AutomationRow) => void) => void;
}
export const LibraryContext = createContext<ProgramLibrary | null>(null);
export function useProgramLibrary(): ProgramLibrary | null {
  return useContext(LibraryContext);
}
