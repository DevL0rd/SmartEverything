import { JSON_VALUE } from '@smarteverything/domain';
import type { CommandRow, JsonValue, SignalInput } from '@smarteverything/domain';
import type { NodeResult } from '@smarteverything/flow/interpret/frames';
import { z } from 'zod';
import type { Clock } from '../clock';
import type { CauseLink } from './driver/admission';
import type { FinishedRun, RunScope } from './driver/ports';
import type { EffectRun } from './effects/effect-run';
import type { Loaded } from './engine-v3-types';
import type { TriggerFire } from './triggers-v3/payload';

const CHILD_CALL = z.object({
  automation: z.string().min(1),
  inputs: z.record(z.string(), JSON_VALUE),
  wait: z.boolean(),
  parentRunId: z.string().min(1),
  causeChain: z.array(z.object({ automationId: z.string(), runId: z.string() })),
});

export interface ChildCall {
  readonly automation: string;
  readonly inputs: Readonly<Record<string, JsonValue>>;
  readonly wait: boolean;
  readonly parentRunId: string;
  readonly causeChain: readonly CauseLink[];
}

export function childCall(params: Readonly<Record<string, JsonValue>>): ChildCall | undefined {
  const call = CHILD_CALL.safeParse(params);
  return call.success ? call.data : undefined;
}

export function calledFire(
  target: Loaded,
  automationId: string,
  clock: Pick<Clock, 'now'>,
): TriggerFire {
  const at = clock.now().toISOString();
  const entry = target.subject.program.triggers.find((node) => node.kind === 'trigger.called');
  return {
    automationId,
    triggerId: entry?.id ?? 'manual',
    key: entry === undefined ? 'manual' : 'call',
    kind: 'trigger.called',
    at,
    payload: { at },
  };
}

export function effectRun(
  scope: RunScope,
  trigger: SignalInput | null,
  retain: (runId: string, rows: readonly CommandRow[]) => void,
): EffectRun {
  return {
    runId: scope.runId,
    automationId: scope.automationId,
    signal: scope.signal,
    trigger,
    commands: (rows): void => {
      retain(scope.runId, rows);
    },
  };
}

export function childOutcome(finished: FinishedRun): NodeResult {
  if (finished.outcome === 'succeeded') return { ok: true, value: {} };
  return { ok: false, class: 'Failed', message: finished.error ?? 'The run did not succeed' };
}

export type RunOutputs = Readonly<Record<string, JsonValue>> | null;

export interface SettledRun extends FinishedRun {
  readonly outputs: RunOutputs;
}

export class Finishes {
  private readonly waiting = new Map<string, ((finished: SettledRun) => void)[]>();
  private readonly outputs = new Map<string, RunOutputs>();

  wait(runId: string): Promise<SettledRun> {
    return new Promise((resolve) => {
      const held = this.waiting.get(runId) ?? [];
      held.push(resolve);
      this.waiting.set(runId, held);
    });
  }

  keep(runId: string, outputs: RunOutputs): void {
    if (this.waiting.has(runId)) this.outputs.set(runId, outputs);
  }

  settle(finished: FinishedRun): void {
    const outputs = this.outputs.get(finished.runId) ?? null;
    this.outputs.delete(finished.runId);
    for (const resolve of this.waiting.get(finished.runId) ?? []) resolve({ ...finished, outputs });
    this.waiting.delete(finished.runId);
  }
}
