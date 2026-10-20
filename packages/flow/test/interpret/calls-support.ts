import type { InputPort, OutputPort, PortValue } from '@smarteverything/domain';
import type { Plan, PlanOp } from '../../src/compile/plan';
import type { FunctionInterface } from '../../src/functions/interface-hash';
import { CALL_FRAMES, callOps, planOwner } from '../../src/interpret/calls';
import type { CalleeResolver } from '../../src/interpret/calls';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import type { EffectRequest, StepContext } from '../../src/interpret/frames';
import { step } from '../../src/interpret/step';
import { resolveBudgets } from '../../src/state/budgets';
import type { PlanRef, RunState } from '../../src/state/run-state';
import { at, contextOf, effect, planOf, NOW, stateOf } from './core-support';
import type { Trace } from './core-support';

export const HASH = 'b'.repeat(64);
export const NUMBER = { t: 'number' } as const;

export const input = (name: string, extra: Partial<InputPort> = {}): InputPort => ({
  name,
  type: NUMBER,
  required: true,
  ...extra,
});

export const output = (name: string, optional = false): OutputPort => ({
  name,
  type: NUMBER,
  ...(optional ? { optional } : {}),
});

export function iface(extra: Partial<FunctionInterface> = {}): FunctionInterface {
  return { inputs: [], outputs: [], exits: [], ...extra };
}

export function callOp(
  key: string,
  fn: string,
  inputs: Record<string, PortValue> = {},
  pin?: number,
): PlanOp {
  return {
    op: 'call',
    at: at(key),
    fn,
    ...(pin === undefined ? {} : { pin }),
    inputs,
    detached: false,
  };
}

export function functionPlan(body: PlanOp, extra: Partial<Plan> = {}): Plan {
  return planOf(body, { subject: 'function', ...extra });
}

export interface Rig {
  readonly caller: Plan;
  readonly callees: Readonly<Record<string, Plan>>;
  readonly interfaces?: Readonly<Record<string, FunctionInterface>>;
  readonly refs?: readonly PlanRef[];
  readonly resolver?: CalleeResolver;
  readonly budgets?: Parameters<typeof resolveBudgets>[0];
}

export type Driven = Trace;

export function messageOf(trace: Trace): string {
  return trace.outcome.kind === 'failed' ? trace.outcome.error.message : '';
}

export function contextFor(rig: Rig, state: RunState): StepContext {
  const resolver: CalleeResolver =
    rig.resolver ??
    ((ref): ReturnType<CalleeResolver> => ({
      ok: true,
      value: rig.interfaces?.[ref.id] ?? iface(),
    }));
  return {
    ...contextOf(rig.caller),
    plan: (frame): Plan => {
      const owner = planOwner(state, frame);
      return owner === null ? rig.caller : (rig.callees[owner.id] ?? rig.caller);
    },
    ops: { ...CORE_OPS, ...callOps(resolver) },
    frames: { ...CORE_FRAMES, ...CALL_FRAMES },
    limits: resolveBudgets(rig.budgets),
  };
}

function refsOf(rig: Rig): PlanRef[] {
  return rig.refs
    ? [...rig.refs]
    : Object.keys(rig.callees).map((id) => ({ id, revision: 1, hash: HASH }));
}

export function drive(rig: Rig, initial: RunState): Trace {
  const requests: EffectRequest[] = [];
  let state = initial;
  for (let steps = 1; steps <= 100_000; steps += 1) {
    const stepped = step(contextFor(rig, state), state, { kind: 'run', now: NOW });
    state = stepped.state;
    if (stepped.outcome.kind === 'effect') requests.push(stepped.outcome.request);
    if (stepped.outcome.kind !== 'continue') {
      return { state, outcome: stepped.outcome, records: [], nodes: [], requests, steps };
    }
  }
  throw new Error('the run did not stop');
}

export function begin(rig: Rig, extra: Parameters<typeof stateOf>[0] = {}): RunState {
  const state = stateOf(extra);
  return step(
    contextFor(rig, state),
    { ...state, planRefs: [...state.planRefs, ...refsOf(rig)] },
    {
      kind: 'start',
      now: NOW,
    },
  ).state;
}

export function start(rig: Rig, extra: Parameters<typeof stateOf>[0] = {}): Driven {
  return drive(rig, begin(rig, extra));
}

export const probe = (): PlanOp => effect('probe');
