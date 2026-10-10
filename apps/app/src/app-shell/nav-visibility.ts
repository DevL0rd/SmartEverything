import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { ValueStore, useValue } from '../design/external-store';

const hiders = new ValueStore<number>(0);

export function useHideNavigation(): void {
  useFocusEffect(
    useCallback(() => {
      hiders.update((count) => count + 1);
      return (): void => {
        hiders.update((count) => count - 1);
      };
    }, []),
  );
}

export function useNavigationHidden(): boolean {
  return useValue(hiders) > 0;
}
