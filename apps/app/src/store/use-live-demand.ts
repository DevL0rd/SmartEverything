import { use, useEffect } from 'react';
import type { ProcessWindow, WatchTopic } from '@smarteverything/domain';
import { useForeground } from '../design/animation-gate';
import { ScreenPausedContext } from '../design/screen-pause';
import { useStableCallback } from '../design/use-stable-callback';
import { holdWhileLive, liveWatch } from './live-watch';

export function useLiveDemand(
  deviceId: string,
  topics: readonly WatchTopic[],
  window?: ProcessWindow,
  onScreen = true,
): void {
  const pause = use(ScreenPausedContext);
  const foreground = useForeground();
  const topicsNow = useStableCallback(() => topics);
  const windowNow = useStableCallback(() => window);
  const topicKey = [...topics].sort().join(',');
  const windowKey = window === undefined ? '' : JSON.stringify(window);
  useEffect(() => {
    if (!foreground || !onScreen || topicKey === '') return undefined;
    return holdWhileLive(pause, () => liveWatch.hold(deviceId, topicsNow(), windowNow()));
  }, [deviceId, topicKey, windowKey, foreground, onScreen, pause, topicsNow, windowNow]);
}
