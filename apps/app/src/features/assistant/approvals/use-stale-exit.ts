import { useEffect, useEffectEvent, useRef } from 'react';
import { StaleExit } from './stale-exit';

export function useStaleExit(
  staleIds: readonly string[],
  leave: (id: string) => void,
): (inside: boolean) => void {
  const exit = useRef<StaleExit | null>(null);
  const leaving = useEffectEvent(leave);
  useEffect(() => {
    const created = new StaleExit(leaving);
    exit.current = created;
    return (): void => {
      created.stop();
      exit.current = null;
    };
  }, []);
  useEffect(() => {
    exit.current?.sync(staleIds);
  });
  return (inside) => {
    exit.current?.focus(inside);
  };
}
