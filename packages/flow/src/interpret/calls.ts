import type { InputPort, JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { FunctionInterface } from '../functions/interface-hash';
import { literalFits } from '../check/literals';
import type { Completion, Frame, PlanRef, RunState } from '../state/run-state';
import type { Checked, Env, FrameHandlers, OpHandlers, OpOf, Outputs, StepResult } from './frames';
import {
  DEFAULT_EXIT,
  RETURN_KEY,
  asRecord,
  deriveEnv,
  newFrame,
  next,
  popFrame,
  absorb,
  propagate,
  pushFrame,
  raise,
  setOutputs,
  setRunVar,
  stay,
} from './frames';
import { evaluate, evaluateAll } from './step';

export const CALL_KEY = '$call';
export const CALL_INPUTS_KEY = '$inputs';
export const CALL_EXIT_KEY = '$exit';

const CALL_META = z.strictObject({
  key: z.string().min(1),
  node: z.string().min(1),
  function: z.string().min(1),
  revision: z.int().min(1),
  exits: z.array(z.string().min(1)),
  outputs: z.array(z.strictObject({ name: z.string().min(1), optional: z.boolean() })),
});

type CallMeta = z.infer<typeof CALL_META>;

export type CalleeResolver = (ref: PlanRef) => Checked<FunctionInterface>;

function ok<T>(value: T): Checked<T> {
  return { ok: true, value };
}

function refuse(message: string): Checked<never> {
  return { ok: false, class: 'Invalid', message };
}

export function calleeOf(frame: Frame): { readonly id: string; readonly revision: number } | null {
  const meta = CALL_META.safeParse(frame.outputs[CALL_KEY]);
  return meta.success ? { id: meta.data.function, revision: meta.data.revision } : null;
}

export function planOwner(
  state: RunState,
  frame: Frame,
): { readonly id: string; readonly revision: number } | null {
  const own = calleeOf(frame);
  if (own !== null) return own;
  const index = state.frames.findIndex((held) => held.id === frame.id);
  const owner = state.frames.slice(0, index + 1).findLast((held) => held.kind === 'call');
  return owner === undefined ? null : calleeOf(owner);
}

export function instanceOf(state: RunState): string {
  const nodes: string[] = [];
  const functions: string[] = [];
  for (const frame of state.frames) {
    const meta = CALL_META.safeParse(frame.outputs[CALL_KEY]);
    if (!meta.success) continue;
    const seen = functions.indexOf(meta.data.function);
    if (seen !== -1) {
      nodes.length = seen + 1;
      functions.length = seen + 1;
    } else {
      nodes.push(meta.data.node);
      functions.push(meta.data.function);
    }
  }
  return nodes.join('/');
}

export function callInputs(state: RunState): Outputs | undefined {
  const frame = state.frames.findLast((held) => held.kind === 'call');
  return frame === undefined ? undefined : asRecord(frame.outputs[CALL_INPUTS_KEY]);
}

function pinnedRef(env: Env, op: OpOf['call']): Checked<PlanRef> {
  const ref = env.state.planRefs.reduce<PlanRef | undefined>((best, held) => {
    if (held.id !== op.fn) return best;
    if (op.pin !== undefined) return held.revision === op.pin ? held : best;
    return best === undefined || held.revision > best.revision ? held : best;
  }, undefined);
  return ref === undefined
    ? {
        ok: false,
        class: 'NotFound',
        message: `the Custom Node ${op.fn} is not pinned in this run`,
      }
    : ok(ref);
}

function fits(port: InputPort, value: JsonValue): boolean {
  return (value === null && port.type.t === 'optional') || literalFits(port.type, value);
}

function bindInputs(
  op: OpOf['call'],
  given: Outputs,
  ports: readonly InputPort[],
): Checked<Outputs> {
  const declared = new Set(ports.map((port) => port.name));
  const unknown = Object.keys(given).find((name) => !declared.has(name));
  if (unknown !== undefined) return refuse(`${op.fn} has no input "${unknown}"`);
  const bound: Record<string, JsonValue> = {};
  for (const port of ports) {
    const value_ = given[port.name];
    if (value_ !== undefined && !fits(port, value_)) {
      return refuse(`the input "${port.name}" of ${op.fn} does not match its declared type`);
    }
    const value = value_ === undefined ? port.default : value_;
    if (value !== undefined) bound[port.name] = value;
    else if (port.required) {
      return refuse(`the input "${port.name}" of ${op.fn} is required and was not given`);
    }
  }
  return ok(bound);
}

function metaOf(op: OpOf['call'], ref: PlanRef, callee: FunctionInterface): CallMeta {
  return {
    key: op.at.key,
    node: op.at.id,
    function: ref.id,
    revision: ref.revision,
    exits: [...callee.exits],
    outputs: callee.outputs.map((port) => ({ name: port.name, optional: port.optional === true })),
  };
}

function initialised(env: Env, pushed: RunState): Checked<RunState> {
  const inner = deriveEnv(env, pushed);
  let state = pushed;
  for (const variable of inner.plan.variables) {
    if (variable.persist === true) continue;
    const initial = evaluate(inner, variable.initial);
    if (!initial.ok) return initial;
    if (initial.value === undefined) {
      return refuse(`the initial value of ${variable.name} is absent`);
    }
    state = setRunVar(state, variable.name, initial.value);
  }
  return ok(state);
}

function enterWith(env: Env, meta: CallMeta, inputs: Outputs): StepResult {
  const frame = newFrame(env.state, 'call', 'body');
  const outputs = { [CALL_KEY]: meta, [CALL_INPUTS_KEY]: inputs };
  const pushed = pushFrame(env.state, { ...frame, outputs });
  const state = initialised(env, pushed);
  return state.ok ? stay(env, state.value) : raise(env, state);
}

function enterCall(resolve: CalleeResolver, env: Env, op: OpOf['call']): StepResult {
  const ref = pinnedRef(env, op);
  if (!ref.ok) return raise(env, ref);
  const callee = resolve(ref.value);
  if (!callee.ok) return raise(env, callee);
  const given = evaluateAll(env, op.inputs);
  if (!given.ok) return raise(env, given);
  const bound = bindInputs(op, given.value, callee.value.inputs);
  if (!bound.ok) return raise(env, bound);
  return enterWith(env, metaOf(op, ref.value, callee.value), bound.value);
}

function declared(meta: CallMeta, returned: Outputs): Checked<Outputs> {
  const values: Record<string, JsonValue> = {};
  for (const port of meta.outputs) {
    const value = returned[port.name];
    if (value !== undefined) values[port.name] = value;
    else if (!port.optional) {
      return refuse(`${meta.function} did not return its required output "${port.name}"`);
    }
  }
  return ok(values);
}

function exitOf(meta: CallMeta, exit: string): Checked<string> {
  return exit === DEFAULT_EXIT || meta.exits.includes(exit)
    ? ok(exit)
    : refuse(`${meta.function} has no exit "${exit}"`);
}

function finishCall(env: Env, exit: string): StepResult {
  const meta = CALL_META.parse(env.frame.outputs[CALL_KEY]);
  const chosen = exitOf(meta, exit);
  if (!chosen.ok) return raise(env, chosen);
  const values = declared(meta, asRecord(env.frame.outputs[RETURN_KEY]));
  if (!values.ok) return raise(env, values);
  const popped = popFrame(absorb(env, env.state));
  const produced = { ...values.value, [CALL_EXIT_KEY]: chosen.value };
  return next(env, setOutputs(popped, meta.key, produced));
}

function callFrame(env: Env, completion: Completion): StepResult {
  switch (completion.kind) {
    case 'normal':
      return finishCall(env, DEFAULT_EXIT);
    case 'return':
      return finishCall(env, completion.exit ?? DEFAULT_EXIT);
    case 'break':
    case 'continue':
      return raise(env, {
        class: 'Failed',
        message: `${completion.kind} reached the end of a Custom Node outside a loop`,
      });
    case 'error':
    case 'stop':
    case 'cancelled':
      return propagate(env, completion);
  }
}

export const CALL_FRAMES: FrameHandlers = { call: callFrame };

export function callOps(resolve: CalleeResolver): OpHandlers {
  return { call: { enter: (env, op) => enterCall(resolve, env, op) } };
}
