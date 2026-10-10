import { useEffect, useState } from 'react';
import { playTime } from '../../../../format/time';

const SECOND_MS = 1000;

export function useElapsed(startedAt: number | null, running: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      return undefined;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, SECOND_MS);
    return (): void => {
      clearInterval(timer);
    };
  }, [running]);
  return startedAt === null ? playTime(0) : playTime((now - startedAt) / SECOND_MS);
}
