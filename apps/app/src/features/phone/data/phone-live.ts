import { useSyncExternalStore } from 'react';
import type { WatchTopic } from '@smarteverything/domain';
import { liveWatch, type LiveWatchRegistry } from '../../../store/live-watch';

export const PHONE_LIVE_TOPICS: readonly WatchTopic[] = ['live'];

const LIVE: WatchTopic = 'live';

function heldBy(registry: LiveWatchRegistry, deviceId: string): boolean {
  return registry.topicsOf(deviceId).has(LIVE);
}

export function usePhoneLiveHeld(deviceId: string): boolean {
  return useSyncExternalStore(
    (notify) =>
      liveWatch.follow((changed) => {
        if (changed === deviceId) notify();
      }),
    () => heldBy(liveWatch, deviceId),
  );
}
