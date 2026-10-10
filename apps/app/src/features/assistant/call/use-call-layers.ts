import { useState } from 'react';
import type { SourceScope } from './model/call-sources';

export type CallLayer =
  | { readonly kind: 'settings' }
  | { readonly kind: 'explainer' }
  | { readonly kind: 'menu'; readonly which: 'camera' | 'share' }
  | { readonly kind: 'picker'; readonly scope: SourceScope; readonly still: boolean };

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
