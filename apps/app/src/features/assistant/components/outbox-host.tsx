import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useStoreSelector } from '../../../store/store-context';
import { useSyncStatus } from '../../../store/selectors';
import { useAiDraftsStore } from '../data/ai-drafts';
import { flushOutbox, usePendingCount } from '../data/outbox';
import { background } from '@smarteverything/logging';

export function OutboxHost(): ReactNode {
  const live = useSyncStatus().status === 'live';
  const waiting = usePendingCount();
  const profileId = useStoreSelector((state) => state.session?.client.profile_id ?? null);
  useAiDraftsStore(profileId);
  useEffect(() => {
    if (live && waiting > 0) {
      background(flushOutbox(), 'outbox.flush_failed');
    }
  }, [live, waiting]);
  return null;
}
