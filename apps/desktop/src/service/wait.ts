import { inspect } from 'node:util';
import { Logger } from '@smarteverything/logging';

const log = new Logger('desktop.service');

interface WaitListener {
  readonly changed: (name: string) => void;
  readonly failed: (cause: unknown) => void;
}

export interface WaitOptions {
  readonly expected: string;
  readonly check: () => Promise<boolean>;
  readonly timeoutMs: number;
  readonly watch: (listener: WaitListener) => () => void;
  readonly timedOut: () => Promise<unknown>;
}

export function waitFor(options: WaitOptions): Promise<void> {
  const { expected, check, timeoutMs, watch, timedOut } = options;
  const startedAt = Date.now();
  log.debug('service.wait_started', { expected, timeoutMs });
  return new Promise((resolve, reject) => {
    let settled = false;
    let checks = 0;
    const finish = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      stop();
      log.debug('service.wait_finished', () => ({
        expected,
        ok: error === null,
        checks,
        durationMs: Date.now() - startedAt,
      }));
      if (error === null) {
        resolve();
      } else {
        reject(error instanceof Error ? error : new Error(inspect(error)));
      }
    };
    const evaluate = (): void => {
      checks += 1;
      check().then((done) => {
        if (done) {
          finish(null);
        }
      }, finish);
    };
    const timer = setTimeout(() => {
      log.warn('service.wait_timeout', { expected, timeoutMs, checks });
      timedOut().then(finish, finish);
    }, timeoutMs);
    const stop = watch({ changed: evaluate, failed: finish });
    evaluate();
  });
}
