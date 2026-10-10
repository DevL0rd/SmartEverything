import { createContext, useContext } from 'react';

const HeaderSearchContext = createContext<(() => void) | null>(null);

export const HeaderSearchProvider = HeaderSearchContext.Provider;

export function useHeaderSearchHandler(): (() => void) | null {
  return useContext(HeaderSearchContext);
}
