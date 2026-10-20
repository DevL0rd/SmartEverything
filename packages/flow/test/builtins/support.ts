import type { ErrorClass, FunctionV3, JsonValue } from '@smarteverything/domain';
import { FLOW_SCOPE_OUTPUTS, NODE_REGISTRY } from '@smarteverything/domain';
import type { CheckContext } from '../../src/check/check';
import type { LintContext } from '../../src/check/lint';
import { lower } from '../../src/compile/lower';
import type { Plan } from '../../src/compile/plan';
import { CORE_FRAMES, CORE_OPS } from '../../src/interpret/core-ops';
import type {
  NodeResult,
  Outcome,
  Outputs,
  StepContext,
  StepEvent,
} from '../../src/interpret/frames';
import { pureEvaluators } from '../../src/nodes/pure';
import { VAR_CHANGE_REQUEST, changeVariable } from '../../src/nodes/state/var-change';
import { LOOP_FRAMES, LOOP_OPS } from '../../src/interpret/loops';
import { TRY_FRAMES, TRY_OPS } from '../../src/interpret/try';
import { step } from '../../src/interpret/step';
import { resumeResult, waitOps } from '../../src/interpret/waits';
import type { WaitResume } from '../../src/interpret/waits';
import { contextOf, NOW, spy, stateOf } from '../interpret/core-support';

export function checkContext(): CheckContext {
  return {
    kinds: (id) => NODE_REGISTRY.get(id),
    scopeOutputs: (kind) => FLOW_SCOPE_OUTPUTS[kind] ?? [],
    references: () => true,
    functions: () => undefined,
    secrets: new Set(),
    automations: () => undefined,
  };
}

export function lintContext(): LintContext {
  return checkContext();
}

interface Call {
  readonly kind: string;
  readonly params: Outputs;
}

export interface World {
  readonly reads?: Readonly<Record<string, (inputs: Outputs) => Outputs>>;
  readonly effects?: Readonly<Record<string, (params: Outputs) => Outputs>>;
  readonly unreachable?: readonly string[];
  readonly answer?: string;
}

export interface Simulation {
  readonly outcome: Outcome;
  readonly effects: readonly Call[];
  readonly reads: readonly Call[];
}

interface Failed {
  readonly ok: false;
  readonly class: ErrorClass;
  readonly message: string;
}

function failure(errorClass: ErrorClass, message: string): Failed {
  return { ok: false, class: errorClass, message };
}

function planOf(program: FunctionV3): Plan {
  const lowered = lower(program, { kinds: (id) => NODE_REGISTRY.get(id) });
  if (!lowered.ok) throw new Error(JSON.stringify(lowered.problems));
  return lowered.plan;
}

function contextFor(program: FunctionV3, world: World, reads: Call[]): StepContext {
  return contextOf(planOf(program), spy(), {
    pure: pureEvaluators({ timeZone: 'UTC', now: () => NOW, trigger: () => null }),
    changeVar: (request) => {
      const changed = changeVariable(
        request.current,
        VAR_CHANGE_REQUEST.parse({ ...request.change, amount: request.amount }),
      );
      return changed.ok
        ? {
            ok: true,
            value: { value: changed.value, previous: changed.previous, wrapped: changed.wrapped },
          }
        : failure(changed.errorClass, changed.message);
    },
    frames: { ...CORE_FRAMES, ...LOOP_FRAMES, ...TRY_FRAMES },
    ops: {
      ...CORE_OPS,
      ...LOOP_OPS,
      ...TRY_OPS,
      ...waitOps({ nextOccurrence: () => failure('Invalid', 'no clock') }),
    },
    reads: {
      node: (request): NodeResult => {
        reads.push({ kind: request.kind, params: request.inputs });
        const read = world.reads?.[request.kind];
        if (read === undefined) return failure('Invalid', `no fake read for ${request.kind}`);
        return { ok: true, value: read(request.inputs) };
      },
      variable: () => failure('Invalid', 'no persistent variable'),
    },
  });
}

function settle(world: World, effects: Call[], kind: string, params: Outputs): NodeResult {
  effects.push({ kind, params });
  if (world.unreachable?.includes(kind) === true) {
    return failure('Unreachable', `${kind} could not be reached`);
  }
  const effect = world.effects?.[kind];
  if (effect === undefined)
    return { ok: true, value: kind === 'notify.ask' ? { notificationId: 'q1' } : {} };
  return { ok: true, value: effect(params) };
}

function resumeFor(kind: string, world: World): WaitResume {
  if (kind === 'duration' || kind === 'until_instant') return { kind: 'due', recovered: false };
  if (kind === 'condition') return { kind: 'evaluate' };
  if (kind === 'answer' && world.answer !== undefined) {
    return world.answer === 'timeout'
      ? { kind: 'timeout' }
      : { kind: 'answer', answer: world.answer };
  }
  throw new Error(`cannot wake a ${kind} wait`);
}

function withDefaults(
  program: FunctionV3,
  inputs: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  const standard = program.inputs.flatMap((port) =>
    port.default === undefined ? [] : [[port.name, port.default] as const],
  );
  return { ...Object.fromEntries(standard), ...inputs };
}

export function simulate(
  program: FunctionV3,
  inputs: Readonly<Record<string, JsonValue>>,
  world: World = {},
): Simulation {
  const effects: Call[] = [];
  const reads: Call[] = [];
  const ctx = contextFor(program, world, reads);
  let state = stateOf({ inputs: withDefaults(program, inputs) });
  let event: StepEvent = { kind: 'start', now: NOW };
  for (let steps = 0; steps < 1000; steps += 1) {
    const stepped = step(ctx, state, event);
    state = stepped.state;
    const { outcome } = stepped;
    if (outcome.kind === 'done' || outcome.kind === 'failed') return { outcome, effects, reads };
    if (outcome.kind === 'effect') {
      const { kind, params } = outcome.request;
      event = { kind: 'resolved', now: NOW, result: settle(world, effects, kind, params) };
    } else if (outcome.kind === 'park') {
      const resume = resumeFor(outcome.wait.kind, world);
      event = { kind: 'resolved', now: NOW, result: resumeResult(outcome.wait, resume) };
    } else {
      event = { kind: 'run', now: NOW };
    }
  }
  throw new Error('the run did not stop');
}

export function outputsOf(simulation: Simulation): Outputs {
  if (simulation.outcome.kind !== 'done') {
    throw new Error(`the run did not finish: ${JSON.stringify(simulation.outcome)}`);
  }
  return simulation.outcome.outputs;
}

export function reading(value: JsonValue): Outputs {
  return { value, available: true };
}

export function aggregated(value: JsonValue, count: number): Outputs {
  return { value, count, matching: [] };
}
