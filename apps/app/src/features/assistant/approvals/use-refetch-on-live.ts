import { useEffect, useEffectEvent, useRef } from 'react';

export function useRefetchOnLive(live: boolean, refetch: () => void): void {
  const was = useRef(live);
  const run = useEffectEvent(refetch);
  useEffect(() => {
    if (live && !was.current) run();
    was.current = live;
  }, [live]);
}
