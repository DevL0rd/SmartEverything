import { createContext, useContext, type RefObject } from 'react';
import type { View } from 'react-native';

export const UpdateDetailsFallbackFocus = createContext<RefObject<View | null> | null>(null);

function fallbackOf(
  action: RefObject<View | null> | undefined,
  shell: RefObject<View | null> | null,
): RefObject<View | null> {
  return {
    get current(): View | null {
      return action?.current ?? shell?.current ?? null;
    },
  };
}

export function useUpdateDetailsFallback(
  action: RefObject<View | null> | undefined,
): RefObject<View | null> {
  return fallbackOf(action, useContext(UpdateDetailsFallbackFocus));
}
