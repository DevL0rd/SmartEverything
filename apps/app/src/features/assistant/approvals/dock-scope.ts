import { createContext, type RefObject } from 'react';

export interface DockScope {
  readonly root: RefObject<unknown> | null;
  readonly active: boolean;
}

export const DockScopeContext = createContext<DockScope>({ root: null, active: true });
