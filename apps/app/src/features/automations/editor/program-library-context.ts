import { createContext, useContext } from 'react';
import type {
  AutomationValueContent,
  AutomationValueRow,
  AutomationSequenceRow,
} from '@smarteverything/domain';

export interface ProgramLibrary {
  readonly value: (
    row: AutomationValueRow | null,
    kind: AutomationValueContent['kind'],
    select: (row: AutomationValueRow) => void,
    lockKind?: boolean,
  ) => void;
  readonly sequence: (
    row: AutomationSequenceRow | null,
    select: (row: AutomationSequenceRow) => void,
  ) => void;
}
export const LibraryContext = createContext<ProgramLibrary | null>(null);
export function useProgramLibrary(): ProgramLibrary | null {
  return useContext(LibraryContext);
}
