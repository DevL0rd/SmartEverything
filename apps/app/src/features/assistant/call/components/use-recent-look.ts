import { useEffect, useState } from 'react';
import type { CallLook } from '../call-state';

const SHOWN_MS = 6000;

export function useRecentLook(looks: readonly CallLook[]): CallLook | null {
  const last = looks.at(-1) ?? null;
  const lastId = last?.lookId;
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (lastId === undefined) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setDismissed(lastId);
    }, SHOWN_MS);
    return (): void => {
      clearTimeout(timer);
    };
  }, [lastId]);
  return last !== null && last.lookId !== dismissed ? last : null;
}
