import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useSyncStatus } from '../../../store/selectors';
import { flushOutbox, usePendingCount } from '../data/outbox';

export function OutboxHost(): ReactNode {
  const live = useSyncStatus().status === 'live';
  const waiting = usePendingCount();
  useEffect(() => {
    if (live && waiting > 0) {
      void flushOutbox();
    }
  }, [live, waiting]);
  return null;
}
