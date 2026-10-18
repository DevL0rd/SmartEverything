import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSyncStatus } from '../../../store/selectors';
import { useStoreSelector } from '../../../store/store-context';
import { areaStatusOf, graceElapsed, onGraceElapsed, type AreaStatus } from '../model/area-status';
import { useAssistantStatus } from './assistant-data';

function useGraceElapsed(): boolean {
  const offlineSince = useStoreSelector((state) => state.sync.offlineSince);
  const subscribe = useCallback(
    (notify: () => void) => onGraceElapsed(offlineSince, Date.now(), notify),
    [offlineSince],
  );
  return useSyncExternalStore(
    subscribe,
    () => graceElapsed(offlineSince, Date.now()),
    () => graceElapsed(offlineSince, Date.now()),
  );
}

export function useAreaStatus(): AreaStatus {
  const sync = useSyncStatus().status;
  const assistantKnown = useAssistantStatus() !== null;
  const chatCount = useStoreSelector((state) => state.tables.ai_chats.ids.length);
  const elapsed = useGraceElapsed();
  return useMemo(
    () => areaStatusOf({ sync, assistantKnown, chatCount, graceElapsed: elapsed }),
    [sync, assistantKnown, chatCount, elapsed],
  );
}
