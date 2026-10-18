import { createContext } from 'react';
import type { CommandLedger } from './command-ledger';
import type { EntityStore } from './entity-store';

export interface StoreRuntime {
  readonly store: EntityStore;
  readonly ledger: CommandLedger;
}

export const StoreContext = createContext<StoreRuntime | null>(null);
