import type { ActionMode } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { awaitRun } from './run-abort';
import type { EffectRun } from './effect-run';

export interface Delivery<T> {
  readonly kind: string;
  readonly mode: ActionMode;
  readonly run: Pick<EffectRun, 'runId' | 'automationId' | 'signal' | 'late'>;
  readonly work: () => Promise<T>;
}

export async function deliver<T>(delivery: Delivery<T>): Promise<T | undefined> {
  const { kind, mode, run, work } = delivery;
  if (mode === 'wait_for_result') return await awaitRun(work(), run);
  const sent = work();
  background(sent, 'automation.late_failure', {
    kind,
    runId: run.runId,
    automationId: run.automationId,
  });
  background(
    sent.then(undefined, (cause: unknown) => {
      run.late(cause);
    }),
    'automation.late_failure_trace',
    { kind, runId: run.runId },
  );
  return undefined;
}
