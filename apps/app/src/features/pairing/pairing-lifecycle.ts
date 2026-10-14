import { useEffect, useRef } from 'react';
import {
  followPairingInvitations,
  pendingPairingInvitation,
} from '../../api/pairing-invitation-import';
import type { PairingPresentation } from './pairing-actions';

function connectPairingLifecycle(pairing: PairingPresentation): () => void {
  pairing.start();
  const unsubscribe = pairing.controller.state.subscribe(() => {
    const state = pairing.controller.state.get();
    if (state.status === 'choosing') {
      pairing.clear();
      pairing.home.set(null);
      if (state.problem !== null) pairing.mode.set('welcome');
    }
    if (state.status === 'enrolling' && state.enrollment.status === 'ready')
      pairing.home.set(state.enrollment.identity.name);
  });
  const imported = (): void => {
    const invitation = pendingPairingInvitation.get();
    if (invitation === null) return;
    if (pairing.busy.get()) {
      pairing.clear();
      return;
    }
    void pairing.imported(invitation);
  };
  const unfollow = followPairingInvitations(imported);
  imported();
  return (): void => {
    unfollow();
    unsubscribe();
    void pairing.stop().catch((error: unknown) => {
      pairing.cleanupFailed(error);
    });
  };
}

export function usePairingLifecycle(pairing: PairingPresentation): void {
  const generation = useRef(0);
  useEffect(() => {
    const lifecycle = generation;
    const advance = (): number => ++lifecycle.current;
    const current = advance();
    let disconnect: (() => void) | null = null;
    queueMicrotask(() => {
      if (current === lifecycle.current) disconnect = connectPairingLifecycle(pairing);
    });
    return (): void => {
      const retired = advance();
      if (disconnect !== null) {
        disconnect();
        return;
      }
      queueMicrotask(() => {
        if (retired !== lifecycle.current) return;
        void pairing.stop().catch((error: unknown) => {
          pairing.cleanupFailed(error);
        });
      });
    };
  }, [pairing]);
}
