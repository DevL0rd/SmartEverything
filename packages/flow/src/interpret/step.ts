import type { JsonValue, PortValue, Variable, Wire } from '@smarteverything/domain';
import type { Plan, PlanOp } from '../compile/plan';
import { readIndex } from '../compile/reads';
import type { Index } from '../compile/reads';
import { countStep, stepBreach, suspended } from '../state/budgets';
import { breachError } from '../state/errors';
import type { RunState } from '../state/run-state';
import { callInputs, instanceOf } from './calls';
import { clipToPass, interruptPass, passExpired } from './pass-deadline';
import { sizeGuarded } from './size-guard';
import type { Checked, Env, Evaluated, NodeResult, Outputs, StepContext } from './frames';
import { keptFor, keptScope, keptStart } from './kept';
import type { OpName, OpOf, StepEvent, StepResult } from './frames';
import {
  InterpreterError,
  asRecord,
  completeFrame,
  deriveEnv,
  executes,
  lookupOutput,
  ownsScope,
  makeEnv,
  raise,
  runVars,
  setRunVar,
  siteOf,
  stay,
  traceNode,
  tracesAtEnd,
  unsupported,
} from './frames';

const indexes = new WeakMap<Plan, Index>();

function held(env: Env, name: string): JsonValue | undefined {
  const key = `${env.activation}/${name}`;
  return env.scratch.captured.get(key) ?? env.state.captures[key];
}

function capture(env: Env, name: string, value: JsonValue): JsonValue {
  env.scratch.captured.set(`${env.activation}/${name}`, value);
  env.scratch.records.push({ kind: 'capture', activation: env.activation, node: name, value });
  return value;
}

export function evaluateAll(
  env: Env,
  ports: Readonly<Record<string, PortValue>>,
): Checked<Outputs> {
  const values: Record<string, JsonValue> = {};
  for (const [name, port] of Object.entries(ports)) {
    const evaluated = evaluate(env, port);
    if (!evaluated.ok) return evaluated;
    if (evaluated.value !== undefined) values[name] = evaluated.value;
  }
  return { ok: true, value: values };
}

function storedValue(env: Env, variable: Variable): Evaluated {
  const scope = keptScope(env, variable);
  const read = env.ctx.reads.variable(variable.name, scope);
  if (!read.ok || read.value !== undefined || scope === undefined) return read;
  return keptStart(env, variable);
}

function persistentValue(env: Env, variable: Variable): Evaluated {
  const kept = held(env, `vars.${variable.name}`);
  if (kept !== undefined) return { ok: true, value: kept };
  const read = storedValue(env, variable);
  if (read.ok && read.value !== undefined) capture(env, `vars.${variable.name}`, read.value);
  return read;
}

function variableValue(env: Env, name: string): Evaluated {
  const variable = env.plan.variables.find((candidate) => candidate.name === name);
  if (variable?.persist === true) return persistentValue(env, variable);
  return { ok: true, value: runVars(env.state)[name] };
}

function runRecord(state: RunState): JsonValue {
  return {
    id: state.runId,
    startedAt: new Date(state.budgets.startedAt).toISOString(),
    automation: { automation: state.automationId },
  };
}

function rootValue(env: Env, root: string): Evaluated {
  switch (root) {
    case 'trigger':
      return { ok: true, value: env.state.payload };
    case 'inputs':
      return { ok: true, value: callInputs(env.state) ?? env.state.inputs };
    case 'home':
      return { ok: true, value: env.ctx.home };
    case 'run':
      return { ok: true, value: runRecord(env.state) };
    default:
      return nodeRoot(env, root);
  }
}

function nodeRoot(env: Env, key: string): Evaluated {
  const index = indexes.get(env.plan) ?? readIndex(env.plan);
  indexes.set(env.plan, index);
  const producer = index.producers.get(key);
  if (producer === undefined) return { ok: true, value: lookupOutput(env.state, key) };
  const produced = env.scratch.memo.get(key) ?? produce(env, producer);
  env.scratch.memo.set(key, produced);
  return produced.ok ? { ok: true, value: produced.value } : produced;
}

function produce(env: Env, producer: Extract<PlanOp, { op: 'compute' | 'read' }>): NodeResult {
  return producer.op === 'compute' ? compute(env, producer) : read(env, producer);
}

function compute(env: Env, producer: Extract<PlanOp, { op: 'compute' }>): NodeResult {
  const evaluator = env.ctx.pure(producer.kind);
  if (evaluator === undefined) {
    return {
      ok: false,
      class: 'Failed',
      message: `no evaluator is registered for ${producer.kind}`,
    };
  }
  return evaluator.evaluate({
    kind: producer.kind,
    node: producer.at,
    ports: {
      names: Object.keys(producer.ports),
      get: (name) => {
        const port = producer.ports[name];
        return port === undefined ? undefined : evaluate(env, port);
      },
    },
  });
}

function read(env: Env, producer: Extract<PlanOp, { op: 'read' }>): NodeResult {
  const kept = held(env, producer.at.key);
  if (kept !== undefined) return { ok: true, value: asRecord(kept) };
  const inputs = evaluateAll(env, producer.ports);
  if (!inputs.ok) return inputs;
  const fresh = env.ctx.reads.node({
    kind: producer.kind,
    node: producer.at,
    inputs: inputs.value,
    seed: env.state.seed,
    activation: env.activation,
    instance: instanceOf(env.state),
    kept: (name) => keptFor(env, name),
  });
  if (!fresh.ok) return fresh;
  return { ok: true, value: asRecord(capture(env, producer.at.key, fresh.value)) };
}

function isFields(value: JsonValue | undefined): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldOf(value: JsonValue | undefined, port: string): JsonValue | undefined {
  return isFields(value) && Object.hasOwn(value, port) ? value[port] : undefined;
}

function wireValue(env: Env, wire: Wire): Evaluated {
  if (wire.from === 'vars') return variableValue(env, wire.port);
  const source = rootValue(env, wire.from);
  return source.ok ? { ok: true, value: fieldOf(source.value, wire.port) } : source;
}

export function evaluate(env: Env, port: PortValue): Evaluated {
  return 'lit' in port ? { ok: true, value: port.lit } : wireValue(env, port.wire);
}

function withoutWait(state: RunState): RunState {
  const { wait: _wait, ...rest } = state;
  return rest;
}

function prepared(state: RunState, event: StepEvent): RunState {
  switch (event.kind) {
    case 'start':
      return state;
    case 'run':
      return { ...state, budgets: countStep(state.budgets) };
    case 'resolved':
      return { ...withoutWait(state), budgets: suspended(state.budgets) };
  }
}

function begin(env: Env): StepResult {
  let state = env.state;
  for (const variable of env.plan.variables) {
    if (variable.persist === true) continue;
    const initial = evaluate(deriveEnv(env, state), variable.initial);
    if (!initial.ok) return raise(env, initial);
    if (initial.value === undefined) {
      return raise(env, {
        class: 'Invalid',
        message: `the initial value of ${variable.name} is absent`,
      });
    }
    state = setRunVar(state, variable.name, initial.value);
  }
  return stay(env, state);
}

function traced(env: Env, from: number, result: StepResult): StepResult {
  if (
    !executes(env.op) ||
    tracesAtEnd(env.op) ||
    (result.state.frames.length > env.state.frames.length && ownsScope(env.op))
  )
    return result;
  const known = result.records
    .slice(from)
    .some((entry) => entry.kind === 'node' && entry.activation === env.activation);
  if (known) return result;
  const { kind } = result.outcome;
  const status = kind === 'effect' ? 'running' : kind === 'park' ? 'waiting' : 'succeeded';
  traceNode(env, status);
  return result;
}

function enter<K extends OpName>(env: Env, kind: K, op: OpOf[K]): StepResult {
  const handler = env.ctx.ops[kind];
  if (handler === undefined) return unsupported(env, `the operation ${kind}`);
  const from = env.scratch.records.length;
  return traced(env, from, handler.enter(env, op));
}

function resolve(env: Env, result: NodeResult): StepResult {
  const { op } = env;
  if (op === undefined) {
    throw new InterpreterError('a resolution', 'an operation waiting for it', 'none');
  }
  return settle(env, op.op, op, result);
}

function settle<K extends OpName>(env: Env, kind: K, op: OpOf[K], result: NodeResult): StepResult {
  const handler = env.ctx.ops[kind]?.settle;
  if (handler === undefined) return unsupported(env, `settling the operation ${kind}`);
  const from = env.scratch.records.length;
  return traced(env, from, handler(env, op, result));
}

function tick(env: Env): StepResult {
  const { cancel } = env.state;
  if (cancel !== undefined) {
    return completeFrame(deriveEnv(env, withoutWait(env.state)), {
      kind: 'cancelled',
      reason: cancel.reason,
    });
  }
  const breach = stepBreach(env.state.budgets, env.ctx.limits);
  if (breach !== null) {
    const error = breachError(breach, siteOf(env), env.state.runId);
    return completeFrame(env, { kind: 'error', error });
  }
  return env.op === undefined
    ? completeFrame(env, { kind: 'normal' })
    : enter(env, env.op.op, env.op);
}

function dispatch(env: Env, event: StepEvent): StepResult {
  switch (event.kind) {
    case 'start':
      return begin(env);
    case 'resolved':
      return resolve(env, event.result);
    case 'run':
      return tick(env);
  }
}

function advanced(env: Env, event: StepEvent): StepResult {
  if (event.kind !== 'start' && passExpired(env.state, event.now)) {
    return interruptPass(env, event.kind === 'resolved');
  }
  return clipToPass(dispatch(env, event));
}

export function step(ctx: StepContext, state: RunState, event: StepEvent): StepResult {
  const env = makeEnv(ctx, prepared(state, event), event.now);
  return sizeGuarded(ctx, event.now, env.state, advanced(env, event));
}
