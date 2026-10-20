import { background } from '@smarteverything/logging';
import type { Clock } from '../../clock';

export class AutomationRunCancelledError extends Error {
  override readonly name = 'AutomationRunCancelledError';
  constructor(readonly runId: string) {
    super(`Automation run ${runId} was cancelled.`);
  }
}

interface Abortable {
  readonly runId: string;
  readonly signal: AbortSignal;
}

export function admitRun(context: Abortable): void {
  if (context.signal.aborted) throw new AutomationRunCancelledError(context.runId);
}

export function awaitRun<T>(work: Promise<T>, context: Abortable): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      reject(new AutomationRunCancelledError(context.runId));
    };
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    background(
      work.then(resolve, reject).finally(() => {
        context.signal.removeEventListener('abort', abort);
      }),
      'run_context.background_failed',
    );
  });
}

export function runDelay(
  clock: Pick<Clock, 'now' | 'at'>,
  milliseconds: number,
  context: Abortable,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      cancel();
      context.signal.removeEventListener('abort', abort);
      reject(new AutomationRunCancelledError(context.runId));
    };
    const cancel = clock.at(new Date(clock.now().getTime() + milliseconds), () => {
      context.signal.removeEventListener('abort', abort);
      resolve();
    });
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
  });
}
