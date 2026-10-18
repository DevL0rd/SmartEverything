import type {
  AutomationRunStep,
  CommandAction,
  CommandRow,
  JsonValue,
  PluginOrigin,
  SignalInput,
} from '@smarteverything/domain';
import type { Clock } from '../clock';
import { background } from '@smarteverything/logging';

export class AutomationRunCancelledError extends Error {
  override readonly name = 'AutomationRunCancelledError';
  constructor(readonly runId: string) {
    super(`Automation run ${runId} was cancelled.`);
  }
}

export interface RunHooks {
  readonly runId: string;
  readonly signal: AbortSignal;
  readonly begin: (nodeId: string) => void;
  readonly end: (step: AutomationRunStep) => void;
  readonly commands: (rows: readonly CommandRow[]) => void;
}

export interface RunContext extends RunHooks {
  readonly automationId: string;
  readonly name: string;
  readonly ownerProfileId: string | null;
  readonly origin: PluginOrigin | null;
  readonly trigger: SignalInput | null;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly scenes: Readonly<Record<string, readonly CommandAction[]>>;
}

export function admitRun(context: Pick<RunHooks, 'runId' | 'signal'>): void {
  if (context.signal.aborted) throw new AutomationRunCancelledError(context.runId);
}

export function awaitRun<T>(
  work: Promise<T>,
  context: Pick<RunHooks, 'runId' | 'signal'>,
): Promise<T> {
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
  context: Pick<RunHooks, 'runId' | 'signal'>,
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
