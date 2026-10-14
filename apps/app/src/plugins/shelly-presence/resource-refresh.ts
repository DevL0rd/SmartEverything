import { createContext, useContext } from 'react';
export const PresenceResourceRefresh = createContext<(() => Promise<void>) | null>(null);
export function usePresenceResourceRefresh(): (() => Promise<void>) | null {
  return useContext(PresenceResourceRefresh);
}
