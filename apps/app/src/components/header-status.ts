import { createContext, useContext, type ReactNode } from 'react';

const HeaderStatusContext = createContext<ReactNode>(null);

export const HeaderStatusProvider = HeaderStatusContext.Provider;

export function useHeaderStatus(): ReactNode {
  return useContext(HeaderStatusContext);
}
