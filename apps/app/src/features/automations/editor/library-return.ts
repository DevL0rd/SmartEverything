import { createContext, useContext, useEffect } from 'react';
import type { AutomationRow, AutomationValueRow } from '@smarteverything/domain';

export interface LibraryReturn {
  readonly close: () => void;
  readonly setDirty: (dirty: boolean) => void;
  readonly valueSaved: (row: AutomationValueRow) => void;
  readonly reusableSaved: (row: AutomationRow) => void;
}
export const LibraryReturnContext = createContext<LibraryReturn | null>(null);
export function useLibraryReturn(dirty: boolean): LibraryReturn | null {
  const destination = useContext(LibraryReturnContext);
  const setDirty = destination?.setDirty;
  useEffect(() => {
    setDirty?.(dirty);
    return (): void => {
      setDirty?.(false);
    };
  }, [setDirty, dirty]);
  return destination;
}
