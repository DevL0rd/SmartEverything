import { useCallback, useInsertionEffect, useRef } from 'react';

export function useStableCallback<Args extends readonly unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);
  useInsertionEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args): Result => latest.current(...args), []);
}
