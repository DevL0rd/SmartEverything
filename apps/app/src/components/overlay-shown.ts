import { createContext, use } from 'react';

export interface ShownSignal {
  readonly mark: () => void;
  readonly seen: () => boolean;
  readonly reset: () => void;
}

export function createSignal(): ShownSignal {
  let seen = false;
  return {
    mark: (): void => {
      seen = true;
    },
    seen: (): boolean => seen,
    reset: (): void => {
      seen = false;
    },
  };
}

const NO_SIGNAL: ShownSignal = createSignal();

export const OverlayShown = createContext<ShownSignal>(NO_SIGNAL);

export function useOverlayShown(): () => void {
  return use(OverlayShown).mark;
}

export function useInsideOverlay(): boolean {
  return use(OverlayShown) !== NO_SIGNAL;
}
