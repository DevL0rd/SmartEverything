import type {
  AutomationRunStep,
  CommandAction,
  CommandRow,
  AutomationSequenceRow,
} from '@smarteverything/domain';
import type { Clock } from '../clock';

export class AutomationRunCancelledError extends Error {
  override readonly name = 'AutomationRunCancelledError';
  constructor(readonly runId: string) {
    super(`Automation run ${runId} was cancelled.`);
  }
}
export class AutomationRunClockError extends Error {
  override readonly name = 'AutomationRunClockError';
  constructor(readonly runId: string) {
    super(`Automation run ${runId} needs Clock.now and Clock.at for an owned cancellable delay.`);
  }
}
export interface ActionExecutionContext {
  readonly runId: string;
  readonly ownerProfileId?: string | null;
  readonly sequence?: (id: string) => AutomationSequenceRow;
  readonly signal: AbortSignal;
  readonly authorize: () => void;
  readonly sceneActions: (sceneId: string) => readonly CommandAction[] | undefined;
  readonly step: (
    index: number | string,
    status: AutomationRunStep['status'],
    error: string | null,
  ) => void;
  readonly commands: (rows: readonly CommandRow[]) => void;
}
export function admitRun(context?: ActionExecutionContext): void {
  if (context === undefined) return;
  if (context.signal.aborted) throw new AutomationRunCancelledError(context.runId);
  context.authorize();
}

export function awaitRun<T>(work: Promise<T>, context: ActionExecutionContext): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      reject(new AutomationRunCancelledError(context.runId));
    };
    context.signal.addEventListener('abort', abort, { once: true });
    if (context.signal.aborted) abort();
    void work.then(resolve, reject).finally(() => {
      context.signal.removeEventListener('abort', abort);
    });
  });
}

export function runDelay(
  clock: Pick<Clock, 'now' | 'at'>,
  milliseconds: number,
  context: ActionExecutionContext,
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
