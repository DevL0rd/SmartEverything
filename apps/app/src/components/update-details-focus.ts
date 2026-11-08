import { createContext, use, type RefObject } from 'react';
import type { View } from 'react-native';

export const UpdateDetailsFallbackFocus = createContext<RefObject<View | null> | null>(null);

export function useUpdateDetailsFallback(
  action: RefObject<View | null> | undefined,
): RefObject<View | null> {
  const shell = use(UpdateDetailsFallbackFocus);
  return {
    get current(): View | null {
      return action?.current ?? shell?.current ?? null;
    },
  };
}
