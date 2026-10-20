import type { JsonValue } from '@smarteverything/domain';
import { sizeChecked } from '../state/budgets';
import { breachError } from '../state/errors';
import type { Frame, RunState } from '../state/run-state';
import { completeFrame, makeEnv, siteOf } from './frames';
import type { StepContext, StepResult } from './frames';

type Values = Readonly<Record<string, JsonValue>>;

function changedBytes(next: Values, prior: Values | undefined): number {
  if (next === prior) return 0;
  let bytes = 0;
  for (const [name, value] of Object.entries(next)) {
    if (prior?.[name] !== value) bytes += name.length + JSON.stringify(value).length;
  }
  return bytes;
}

function frameBytes(frame: Frame, prior: Frame | undefined): number {
  const same = prior?.id === frame.id ? prior : undefined;
  return changedBytes(frame.locals, same?.locals) + changedBytes(frame.outputs, same?.outputs);
}

export function grownBytes(before: RunState, after: RunState): number {
  if (before.frames === after.frames) return 0;
  return after.frames.reduce(
    (total, frame, index) => total + frameBytes(frame, before.frames[index]),
    0,
  );
}

export function sizeGuarded(
  ctx: StepContext,
  now: number,
  before: RunState,
  result: StepResult,
): StepResult {
  const { kind } = result.outcome;
  if (kind === 'done' || kind === 'failed') return result;
  const sized = sizeChecked(result.state, grownBytes(before, result.state), ctx.limits);
  if (sized.breach === null) return { ...result, state: sized.value };
  const env = makeEnv(ctx, sized.value, now);
  const error = breachError(sized.breach, siteOf(env), before.runId);
  const failed = completeFrame(env, { kind: 'error', error });
  return { ...failed, records: [...result.records, ...failed.records] };
}
