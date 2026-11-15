import { useEffect } from 'react';
import { ValueStore, useValue } from '../design/external-store';

const bars = new ValueStore<number>(0);

export function useBottomChromeShown(): void {
  useEffect(() => {
    bars.update((count) => count + 1);
    return (): void => {
      bars.update((count) => count - 1);
    };
  }, []);
}

export function useBottomChrome(): boolean {
  return useValue(bars) > 0;
}
