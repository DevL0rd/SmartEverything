import { useEffect, useRef, useState } from 'react';

export const STREAM_FLUSH_MS = 80;

export interface Flushed<T> {
  readonly value: T;
  readonly at: number | null;
}

export function useFlushedAt<T>(value: T, intervalMs: number, enabled: boolean): Flushed<T> {
  const [flushed, setFlushed] = useState<Flushed<T>>({ value, at: null });
  const flushedAt = useRef(0);
  if (!enabled && flushed.value !== value) setFlushed({ value, at: null });
  useEffect(() => {
    if (!enabled || flushed.value === value) return undefined;
    const timer = setTimeout(
      () => {
        flushedAt.current = Date.now();
        setFlushed({ value, at: flushedAt.current });
      },
      Math.max(0, flushedAt.current + intervalMs - Date.now()),
    );
    return (): void => {
      clearTimeout(timer);
    };
  }, [value, flushed, intervalMs, enabled]);
  return enabled ? flushed : { value, at: null };
}
