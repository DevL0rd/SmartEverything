import { createContext, use } from 'react';

export const TabGroupContext = createContext<string | null>(null);

export function useTabGroup(): string | null {
  return use(TabGroupContext);
}
