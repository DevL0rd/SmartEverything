import { JSON_VALUE } from '@smarteverything/domain';
import type { JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { StateClock, StateStep } from '../nodes/state/adapter';
import { STATE_ADAPTERS } from '../nodes/state/adapters';
import type { Checked, Env, NodeResult, OpHandlers, OpOf, StepResult } from './frames';
import { completeFrame, deriveEnv, next, note, raise, setOutputs, stay, withTop } from './frames';
import { enterScope } from './core-ops';
import { DURABLE_FROM_MS } from './policy';
import { evaluateAll } from './step';
import { resolutionOf } from './waits';

export interface StateMemoryPort {
  readonly recall: (automationId: string, slot: string) => JsonValue | undefined;
  readonly keep: (
    automationId: string,
    slot: string,
    memory: JsonValue,
    wakeAt: number | null,
  ) => void;
}

export interface StatePorts {
  readonly memory: StateMemoryPort;
  readonly clock: StateClock;
}

type StateOp = OpOf['state_op'];

const HOLD_PREFIX = '$hold/';

const HELD = z.strictObject({ slot: z.string(), data: JSON_VALUE });

function holdKey(op: StateOp): string {
  return `${HOLD_PREFIX}${op.at.key}`;
}

function withoutHold(env: Env, op: StateOp): Env {
  const key = holdKey(op);
  const state = {
    ...env.state,
    frames: env.state.frames.map((frame) => {
      const { [key]: _held, ...rest } = frame.outputs;
      return { ...frame, outputs: rest };
    }),
  };
  return deriveEnv(env, state);
}

function leave(env: Env, op: StateOp, exit: string): StepResult {
  const lane = op.scopes?.[exit];
  if (lane !== undefined) return enterScope(env, `${env.path}/scopes/${exit}`, exit);
  note(env, `stopped by ${op.kind} ${op.at.key} (${exit})`);
  return completeFrame(env, { kind: 'normal' });
}

function route(env: Env, op: StateOp, step: Extract<StateStep, { kind: 'done' }>): StepResult {
  if (!op.exits.includes(step.exit)) {
    return raise(env, {
      class: 'Failed',
      message: `${op.kind} has no exit called ${step.exit}`,
    });
  }
  const cleared = withoutHold(env, op);
  const state = setOutputs(cleared.state, op.at.key, step.outputs);
  if (step.exit === op.exits[0]) return next(cleared, state);
  return leave(deriveEnv(cleared, state), op, step.exit);
}

function park(
  env: Env,
  op: StateOp,
  held: { readonly slot: string; readonly step: Extract<StateStep, { kind: 'hold' }> },
): StepResult {
  const { step } = held;
  const wait = {
    kind: 'duration' as const,
    nodePath: env.path,
    durable: step.dueAt - env.now >= DURABLE_FROM_MS,
    dueAt: step.dueAt,
  };
  const record = JSON_VALUE.parse({ slot: held.slot, data: step.data });
  const state = withTop(env.state, (frame) => ({
    ...frame,
    outputs: { ...frame.outputs, [holdKey(op)]: record },
  }));
  return stay(env, { ...state, wait }, { kind: 'park', wait });
}

interface Pending {
  readonly ports: StatePorts;
  readonly op: StateOp;
  readonly slot: string;
}

function proceed(env: Env, pending: Pending, step: StateStep): StepResult {
  const { ports, op, slot } = pending;
  if (step.keep !== undefined) {
    ports.memory.keep(env.state.automationId, slot, step.keep.memory, step.keep.wakeAt ?? null);
  }
  return step.kind === 'done' ? route(env, op, step) : park(env, op, { slot, step });
}

function slotOf(op: StateOp, inputs: Record<string, JsonValue>): Checked<string> {
  const adapter = STATE_ADAPTERS[op.kind];
  return adapter?.slot === undefined
    ? { ok: true, value: op.at.id }
    : adapter.slot(inputs, op.at.id);
}

function enterState(ports: StatePorts): (env: Env, op: StateOp) => StepResult {
  return (env, op) => {
    const adapter = STATE_ADAPTERS[op.kind];
    if (adapter === undefined) {
      return raise(env, {
        class: 'Failed',
        message: `no state adapter is registered for ${op.kind}`,
      });
    }
    const inputs = evaluateAll(env, op.ports);
    if (!inputs.ok) return raise(env, inputs);
    const slot = slotOf(op, { ...inputs.value });
    if (!slot.ok) return raise(env, slot);
    const step = adapter.begin({
      now: env.now,
      inputs: inputs.value,
      memory: ports.memory.recall(env.state.automationId, slot.value),
      clock: ports.clock,
    });
    return step.ok ? proceed(env, { ports, op, slot: slot.value }, step.value) : raise(env, step);
  };
}

function heldOf(env: Env, op: StateOp): Checked<z.infer<typeof HELD>> {
  const parsed = HELD.safeParse(env.frame.outputs[holdKey(op)]);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, class: 'Invalid', message: `${op.at.key} was resumed without a held run` };
}

function settleState(ports: StatePorts): (env: Env, op: StateOp, result: NodeResult) => StepResult {
  return (env, op, result) => {
    const resolution = resolutionOf(env, op, result);
    if (!resolution.ok) return raise(env, resolution);
    if (resolution.value.resume.kind !== 'due') {
      return raise(env, {
        class: 'Invalid',
        message: `${op.at.key} cannot be resumed by ${resolution.value.resume.kind}`,
      });
    }
    const held = heldOf(env, op);
    const adapter = STATE_ADAPTERS[op.kind];
    if (!held.ok) return raise(env, held);
    if (adapter?.settle === undefined) {
      return raise(env, { class: 'Failed', message: `${op.kind} does not wait` });
    }
    const step = adapter.settle(
      { now: env.now, memory: ports.memory.recall(env.state.automationId, held.value.slot) },
      held.value.data,
    );
    return step.ok
      ? proceed(env, { ports, op, slot: held.value.slot }, step.value)
      : raise(env, step);
  };
}

export function stateOps(ports: StatePorts): OpHandlers {
  return { state_op: { enter: enterState(ports), settle: settleState(ports) } };
}
