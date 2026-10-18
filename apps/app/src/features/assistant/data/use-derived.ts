import { useRef } from 'react';
import { usePausable } from '../../../design/external-store';

export function useDerived<T>(
  subscribe: (listener: () => void) => () => void,
  read: () => T,
  equal: (left: T, right: T) => boolean,
): T {
  const last = useRef<{ readonly value: T } | null>(null);
  return usePausable(subscribe, () => {
    const next = read();
    if (last.current !== null && equal(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  });
}
