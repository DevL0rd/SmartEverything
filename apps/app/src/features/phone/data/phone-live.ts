import { useCallback } from 'react';
import type { WatchTopic } from '@smarteverything/domain';
import { usePausable } from '../../../design/external-store';
import { liveWatch, type LiveWatchRegistry } from '../../../store/live-watch';

export const PHONE_LIVE_TOPICS: readonly WatchTopic[] = ['live'];

const LIVE: WatchTopic = 'live';

function heldBy(registry: LiveWatchRegistry, deviceId: string): boolean {
  return registry.topicsOf(deviceId).has(LIVE);
}

export function usePhoneLiveHeld(deviceId: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) =>
      liveWatch.follow((changed) => {
        if (changed === deviceId) notify();
      }),
    [deviceId],
  );
  return usePausable(subscribe, () => heldBy(liveWatch, deviceId));
}
