import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useEntityStore, useStoreSelector } from '../../../store/store-context';
import { useSyncStatus } from '../../../store/selectors';
import { useAiDraftsStore } from '../data/ai-drafts';
import { flushOutbox, usePendingCount } from '../data/outbox';
import { hasSentOutgoing, settleOutgoing, subscribeOutgoing } from '../data/outgoing';
import { background } from '@smarteverything/logging';

const MESSAGES = 'tables.assistant_messages';

function useSettledOutgoing(): void {
  const store = useEntityStore();
  useEffect(() => {
    const settle = (): void => {
      if (hasSentOutgoing()) settleOutgoing(store.get().tables.assistant_messages.rows);
    };
    const offStore = store.subscribeSlices([MESSAGES], settle);
    const offOutgoing = subscribeOutgoing(settle);
    return (): void => {
      offStore();
      offOutgoing();
    };
  }, [store]);
}

export function OutboxHost(): ReactNode {
  useSettledOutgoing();
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
