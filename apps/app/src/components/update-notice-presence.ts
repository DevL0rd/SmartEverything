import { useLayoutEffect } from 'react';
import { ValueStore, useSelected } from '../design/external-store';

export const updateNoticesShown = new ValueStore<number>(0);

export function useUpdateNoticePresence(): void {
  useLayoutEffect(() => {
    updateNoticesShown.update((count) => count + 1);
    return (): void => {
      updateNoticesShown.update((count) => count - 1);
    };
  }, []);
}

export function useUpdateNoticeShown(): boolean {
  return useSelected(updateNoticesShown, (count) => count > 0);
}
