import { useEffect, useState } from 'react';

export interface Progressive {
  readonly first: number;
  readonly batch: number;
}

const DEFAULT: Progressive = { first: 24, batch: 24 };

export function useProgressiveCount(
  total: number,
  enabled = true,
  { first, batch }: Progressive = DEFAULT,
): number {
  const [count, setCount] = useState(first);
  useEffect(() => {
    if (!enabled || count >= total) return undefined;
    const frame = requestAnimationFrame(() => {
      setCount((current) => current + batch);
    });
    return (): void => {
      cancelAnimationFrame(frame);
    };
  }, [count, total, enabled, batch]);
  return enabled ? Math.min(total, count) : total;
}
