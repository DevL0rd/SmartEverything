import { use, useEffect } from 'react';
import { useForeground } from '../design/animation-gate';
import { ScreenPausedContext } from '../design/screen-pause';
import { holdWhileLive, liveWatch } from './live-watch';

const FILES_TOPIC = ['files'] as const;

export function useFolderDemand(deviceId: string, path: string | null): void {
  const pause = use(ScreenPausedContext);
  const foreground = useForeground();
  useEffect(() => {
    if (!foreground || path === null) return undefined;
    return holdWhileLive(pause, () => liveWatch.hold(deviceId, FILES_TOPIC, undefined, path));
  }, [deviceId, path, foreground, pause]);
}
