import { useEffect } from 'react';
import type { Logger } from '@smarteverything/logging';

export function useLifecycleLog(log: Logger, noun: string, subject: string | null = null): void {
  useEffect(() => {
    log.info(`${noun}.mounted`, { subject });
    return (): void => {
      log.info(`${noun}.unmounted`, { subject });
    };
  }, [log, noun, subject]);
}
