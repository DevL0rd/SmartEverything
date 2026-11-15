import { background, type Logger } from '@smarteverything/logging';

type UncaughtListener = (cause: Error, origin?: string) => void;

export interface FailureSource {
  readonly on: (event: 'uncaughtException', listener: UncaughtListener) => unknown;
  readonly off: (event: 'uncaughtException', listener: UncaughtListener) => unknown;
}

export function stopOnUncaught(
  source: FailureSource,
  log: Logger,
  stop: (code: number) => Promise<void>,
): () => void {
  const listener: UncaughtListener = (cause, origin) => {
    log.exception('process.uncaught', cause, {
      origin: origin ?? 'unknown',
      activeResources: process.getActiveResourcesInfo().length,
    });
    background(stop(1), 'lifecycle.shutdown_failed');
  };
  source.on('uncaughtException', listener);
  return (): void => {
    source.off('uncaughtException', listener);
  };
}
