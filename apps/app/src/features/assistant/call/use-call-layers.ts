import { useState } from 'react';
import type { SourceScope } from './model/call-sources';

export type CallPage =
  | { readonly kind: 'explainer' }
  | { readonly kind: 'picker'; readonly scope: SourceScope; readonly still: boolean };

export const HOME_PICKER = {
  kind: 'picker',
  scope: 'home',
  still: false,
} as const satisfies CallPage;
export const WINDOW_PICKER = {
  kind: 'picker',
  scope: 'window',
  still: false,
} as const satisfies CallPage;

type CallLayer =
  | { readonly kind: 'settings' }
  | { readonly kind: 'menu'; readonly which: 'camera' | 'share' }
  | CallPage;

export interface CallLayers {
  readonly layer: CallLayer | null;
  readonly open: (next: CallLayer) => void;
  readonly close: () => void;
  readonly toggleSettings: () => void;
}

export function useCallLayers(): CallLayers {
  const [layer, setLayer] = useState<CallLayer | null>(null);
  return {
    layer,
    open: setLayer,
    close: (): void => {
      setLayer(null);
    },
    toggleSettings: (): void => {
      setLayer((current) => (current?.kind === 'settings' ? null : { kind: 'settings' }));
    },
  };
}
