import { useState, type RefObject } from 'react';
import type { View } from 'react-native';
import { useLiveAnimationGate, useScreenLive } from '../../../design/animation-gate';
import { useOnScreen } from '../../../design/visibility';
import { arrive, holdLedger, settledLedger, type Ledger } from '../model/stream-fade';

export interface FadeGate {
  readonly moving: boolean;
  readonly onLayout: (() => void) | undefined;
}

export function useFadeGate(ref: RefObject<View | null>, streaming: boolean): FadeGate {
  const live = useScreenLive();
  const view = useOnScreen(ref, undefined, streaming);
  const gate = useLiveAnimationGate(streaming, view.visible, live);
  return { moving: gate.moving, onLayout: view.onLayout };
}

export function useArrivals(total: number, at: number | null, fading: boolean): Ledger {
  const [ledger, setLedger] = useState(() => settledLedger(total));
  if (ledger.total !== total) {
    setLedger(at !== null && fading ? arrive(ledger, total, at) : holdLedger(ledger, total));
  }
  return ledger;
}
