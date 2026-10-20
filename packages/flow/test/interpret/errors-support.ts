import type { ErrorClass, StructuredOutput } from '@smarteverything/domain';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import type { EffectRequest, NodeResult, StepContext } from '../../src/interpret/frames';
import { withPolicy } from '../../src/interpret/policy';
import { TRY_FRAMES, TRY_OPS } from '../../src/interpret/try';
import type { Plan, PlanOp } from '../../src/compile/plan';
import { at, contextOf, spy } from './core-support';
import type { Trace } from './core-support';

export type CatchRow = Extract<PlanOp, { op: 'try' }>['catches'][number];

export function tryOp(
  key: string,
  body: PlanOp,
  catches: CatchRow[],
  rest: { finally?: PlanOp; outputs?: StructuredOutput[] } = {},
): PlanOp {
  return { op: 'try', at: at(key), body, catches, ...rest };
}

export function row(id: string, then: PlanOp, classes?: ErrorClass[]): CatchRow {
  return { id, then, ...(classes === undefined ? {} : { classes }) };
}

export function context(plan: Plan): StepContext {
  return contextOf(plan, spy(), {
    ops: withPolicy({ ...CORE_OPS, ...TRY_OPS }),
    frames: { ...CORE_FRAMES, ...TRY_FRAMES },
  });
}

export function failing(...classes: (ErrorClass | 'ok')[]): (request: EffectRequest) => NodeResult {
  const queue = [...classes];
  return (request) => {
    const next = request.node.key.startsWith('boom') ? queue.shift() : 'ok';
    return next === undefined || next === 'ok'
      ? { ok: true, value: {} }
      : { ok: false, class: next, message: `${request.node.key} failed` };
  };
}

export function keys(trace: Trace): string[] {
  return trace.requests.map((request) => request.node.key);
}
