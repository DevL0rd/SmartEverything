import { useEffect, useRef } from 'react';
import {
  followPairingInvitations,
  pendingPairingInvitation,
} from '../../api/pairing-invitation-import';
import { Logger, background } from '@smarteverything/logging';
import type { PairingPresentation } from './pairing-actions';

const log = new Logger('app.pairing');

function connectPairingLifecycle(pairing: PairingPresentation): () => void {
  log.debug('pairing.lifecycle_connected');
  pairing.start();
  let lastStatus: string | null = null;
  const unsubscribe = pairing.controller.state.subscribe(() => {
    const state = pairing.controller.state.get();
    if (state.status !== lastStatus) {
      log.info('pairing.state_changed', {
        from: lastStatus,
        to: state.status,
        problem: state.status === 'choosing' && state.problem !== null,
      });
      lastStatus = state.status;
    }
    if (state.status === 'choosing') {
      pairing.clear();
      if (state.problem !== null) pairing.mode.set('welcome');
    }
  });
  const imported = (): void => {
    const invitation = pendingPairingInvitation.get();
    if (invitation === null) return;
    log.info('pairing.invitation_pending', { busy: pairing.busy.get() });
    if (pairing.busy.get()) {
      pairing.clear();
      return;
    }
    background(pairing.imported(invitation), 'pairing.imported_failed');
  };
  const unfollow = followPairingInvitations(imported);
  imported();
  return (): void => {
    log.debug('pairing.lifecycle_disconnected');
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
