import { FLOW_ERROR, jsonEquals } from '@smarteverything/domain';
import type { FlowError, JsonValue, PortValue, StructuredOutput } from '@smarteverything/domain';
import { z } from 'zod';
import type { PlanOp } from '../compile/plan';
import type { At, VarChange } from '../compile/plan-parts';
import { FLOW_ERRORS } from '../state/errors';
import type { Completion, Frame } from '../state/run-state';
import type {
  Checked,
  Env,
  FrameHandlers,
  NodeResult,
  OpHandlers,
  OpOf,
  Outcome,
  StepResult,
} from './frames';
import {
  DEFAULT_EXIT,
  RETURN_KEY,
  STOP_KEY,
  absorb,
  asRecord,
  boolean,
  complete,
  completeFrame,
  deriveEnv,
  mismatch,
  newFrame,
  next,
  note,
  ownsScope,
  popFrame,
  present,
  propagate,
  pushFrame,
  raise,
  runVars,
  setOutputs,
  setOwnerOutputs,
  setRootOutputs,
  setRunVar,
  siteOf,
  stay,
  text,
  traceNode,
} from './frames';
import { evaluate, evaluateAll } from './step';
import { keptParams } from './kept';
import { traceOwnerEnd } from './owner-trace';

type Locals = Frame['locals'];

const SUCCEEDED: Done = { status: 'succeeded', exit: DEFAULT_EXIT, outputs: {} };

interface Found {
  readonly index: number;
  readonly id: string;
}

const STOP = z.strictObject({
  node: z.string(),
  path: z.string(),
  key: z.string(),
  message: z.string().optional(),
});

function ok<T>(value: T): Checked<T> {
  return { ok: true, value };
}

export function enterScope(env: Env, path: string, scope: string, extra: Locals = {}): StepResult {
  const frame = newFrame(env.state, 'branch', path, { scope, ...extra });
  return stay(env, pushFrame(env.state, frame));
}

function closeEmpty(
  env: Env,
  op: { at: At; outputs?: readonly StructuredOutput[] | undefined },
): StepResult {
  return next(env, op.outputs === undefined ? env.state : setOutputs(env.state, op.at.key, {}));
}

function enterBranch(env: Env, op: OpOf['branch']): StepResult {
  for (const [index, row] of op.rows.entries()) {
    const holds = boolean(evaluate(env, row.when), `the condition of ${row.id}`);
    if (!holds.ok) return raise(env, holds);
    if (holds.value) return enterScope(env, `${env.path}/rows/${String(index)}/then`, row.id);
  }
  if (op.else !== undefined) return enterScope(env, `${env.path}/else`, 'else');
  return closeEmpty(env, op);
}

function inRange(
  subject: JsonValue | undefined,
  range: { min?: number | undefined; max?: number | undefined },
): Checked<boolean> {
  if (subject === undefined) return ok(false);
  if (typeof subject !== 'number')
    return mismatch<boolean>('the switch subject', 'a number', subject);
  return ok(
    (range.min === undefined || subject >= range.min) &&
      (range.max === undefined || subject <= range.max),
  );
}

function matches(
  env: Env,
  match: OpOf['switch']['cases'][number]['match'],
  subject: JsonValue | undefined,
): Checked<boolean> {
  if ('eq' in match) return ok(subject !== undefined && jsonEquals(subject, match.eq));
  if ('in' in match) {
    return ok(subject !== undefined && match.in.some((item) => jsonEquals(subject, item)));
  }
  if ('range' in match) return inRange(subject, match.range);
  return boolean(evaluate(env, match.when), 'a case condition');
}

function findCase(
  env: Env,
  op: OpOf['switch'],
  subject: JsonValue | undefined,
  from: number,
): Checked<Found | undefined> {
  for (const [offset, row] of op.cases.slice(from).entries()) {
    const matched = matches(env, row.match, subject);
    if (!matched.ok) return matched;
    if (matched.value) return ok({ index: from + offset, id: row.id });
  }
  return ok(undefined);
}

function enterCase(env: Env, found: Found, subject: JsonValue | undefined): StepResult {
  const kept: Locals = subject === undefined ? {} : { subject };
  const path = `${env.path}/cases/${String(found.index)}/then`;
  return enterScope(env, path, found.id, { cursor: found.index + 1, ...kept });
}

function enterSwitch(env: Env, op: OpOf['switch']): StepResult {
  const subject = evaluate(env, op.subject);
  if (!subject.ok) return raise(env, subject);
  const found = findCase(env, op, subject.value, 0);
  if (!found.ok) return raise(env, found);
  if (found.value !== undefined) return enterCase(env, found.value, subject.value);
  if (op.default !== undefined) return enterScope(env, `${env.path}/default`, 'default');
  return closeEmpty(env, op);
}

function containerOutputs(op: PlanOp | undefined): readonly StructuredOutput[] | undefined {
  return op !== undefined && 'outputs' in op ? op.outputs : undefined;
}

function evaluateOutputs(
  env: Env,
  outputs: readonly StructuredOutput[],
  scope: string,
): Checked<Record<string, JsonValue>> {
  const values: Record<string, JsonValue> = {};
  for (const output of outputs) {
    const port: PortValue | undefined = output.values[scope];
    if (port === undefined) continue;
    const evaluated = evaluate(env, port);
    if (!evaluated.ok) return evaluated;
    if (evaluated.value !== undefined) values[output.name] = evaluated.value;
  }
  return ok(values);
}

function continueScope(parent: Env, child: Frame): StepResult {
  const { op } = parent;
  const cursor = child.locals['cursor'];
  if (op?.op === 'switch' && op.mode === 'all' && typeof cursor === 'number') {
    const subject = child.locals['subject'];
    const found = findCase(parent, op, subject, cursor);
    if (!found.ok) return raise(parent, found);
    if (found.value !== undefined) return enterCase(parent, found.value, subject);
  }
  return next(parent, parent.state);
}

function scopeFrame(env: Env, completion: Completion): StepResult {
  if (completion.kind !== 'normal') {
    traceOwnerEnd(env, completion);
    return propagate(env, completion);
  }
  const parentOp = deriveEnv(env, popFrame(env.state)).op;
  const outputs = containerOutputs(parentOp);
  const scope = env.frame.locals['scope'];
  const produced =
    outputs === undefined || typeof scope !== 'string'
      ? ok<Record<string, JsonValue>>({})
      : evaluateOutputs(env, outputs, scope);
  if (!produced.ok) return raise(env, produced);
  let state = popFrame(absorb(env, env.state));
  if (ownsScope(parentOp)) {
    traceNode(deriveEnv(env, state), 'succeeded');
  }
  if (outputs !== undefined && parentOp !== undefined && 'at' in parentOp) {
    const kept = asRecord(state.frames.at(-1)?.outputs[parentOp.at.key]);
    state = setOutputs(state, parentOp.at.key, { ...kept, ...produced.value });
  }
  return continueScope(deriveEnv(env, state), env.frame);
}

function enterGuard(env: Env, op: OpOf['guard']): StepResult {
  const holds = boolean(evaluate(env, op.condition), `the condition of ${op.at.key}`);
  if (!holds.ok) return raise(env, holds);
  if (holds.value) return next(env, env.state);
  if (env.frame.kind === 'root' || !op.quietly) note(env, `stopped by guard ${op.at.key}`);
  return completeFrame(env, { kind: 'normal' });
}

type Done = Omit<Extract<Outcome, { kind: 'done' }>, 'kind'>;

function finish(env: Env, done: Done): StepResult {
  return stay(env, env.state, { kind: 'done', ...done });
}

function stopError(env: Env): FlowError {
  const stop = STOP.parse(env.frame.outputs[STOP_KEY]);
  const message = stop.message ?? `the automation was stopped by ${stop.key}`;
  return FLOW_ERRORS.Failed(message, { node: stop.node, path: stop.path, at: env.now });
}

function endRun(env: Env, completion: Completion): StepResult {
  switch (completion.kind) {
    case 'normal':
      return finish(env, SUCCEEDED);
    case 'return':
      return finish(env, {
        ...SUCCEEDED,
        exit: completion.exit ?? DEFAULT_EXIT,
        outputs: asRecord(env.frame.outputs[RETURN_KEY]),
      });
    case 'stop':
      return completion.failed
        ? stay(env, env.state, { kind: 'failed', error: stopError(env) })
        : finish(env, SUCCEEDED);
    case 'cancelled':
      return finish(env, { ...SUCCEEDED, status: 'cancelled', reason: completion.reason });
    case 'error':
      return stay(env, env.state, { kind: 'failed', error: completion.error });
    case 'break':
    case 'continue':
      return raise(env, {
        class: 'Failed',
        message: `${completion.kind} reached the end of the run outside a loop`,
      });
  }
}

function enterReturn(env: Env, op: OpOf['return']): StepResult {
  const values = evaluateAll(env, op.values);
  if (!values.ok) return raise(env, values);
  const state = setOwnerOutputs(env.state, RETURN_KEY, values.value);
  const completion: Completion =
    op.exit === undefined ? { kind: 'return' } : { kind: 'return', exit: op.exit };
  return complete(env, state, completion);
}

function enterStop(env: Env, op: OpOf['stop']): StepResult {
  const message =
    op.message === undefined
      ? ok<string | undefined>(undefined)
      : text(evaluate(env, op.message), `the message of ${op.at.key}`);
  if (!message.ok) return raise(env, message);
  if (message.value !== undefined && !op.failed) note(env, message.value);
  const stop = { node: env.at.id, path: env.path, key: env.at.key };
  const kept = message.value === undefined ? stop : { ...stop, message: message.value };
  const completion: Completion = op.cancelSelf
    ? { kind: 'cancelled', reason: 'user_stop' }
    : { kind: 'stop', failed: op.failed };
  traceNode(env, 'succeeded');
  return complete(env, setRootOutputs(env.state, STOP_KEY, kept), completion);
}

function causeOf(env: Env, port: PortValue | undefined): Checked<FlowError | undefined> {
  if (port === undefined) return ok(undefined);
  const value = present(evaluate(env, port), 'the cause');
  if (!value.ok) return value;
  const parsed = FLOW_ERROR.safeParse(value.value);
  return parsed.success ? ok(parsed.data) : mismatch('the cause', 'an error value', value.value);
}

function failMessage(env: Env, op: OpOf['fail'], cause: FlowError | undefined): Checked<string> {
  if (op.message !== undefined)
    return text(evaluate(env, op.message), `the message of ${op.at.key}`);
  if (cause !== undefined) return ok(cause.message);
  return { ok: false, class: 'Invalid', message: `${op.at.key} needs a message or a cause` };
}

function enterFail(env: Env, op: OpOf['fail']): StepResult {
  const cause = causeOf(env, op.cause);
  if (!cause.ok) return raise(env, cause);
  const message = failMessage(env, op, cause.value);
  if (!message.ok) return raise(env, message);
  const error = FLOW_ERRORS[op.class](message.value, siteOf(env), { cause: cause.value });
  return completeFrame(env, { kind: 'error', error });
}

export function requestOf(
  env: Env,
  op: Pick<OpOf['effect'], 'at' | 'retry' | 'budget'>,
  kind: string,
  params: Record<string, JsonValue>,
): StepResult {
  const request = {
    kind,
    node: op.at,
    path: env.path,
    activation: env.activation,
    key: `${env.state.runId}/${env.activation}`,
    params,
    retry: op.retry,
    budget: op.budget,
  };
  return stay(env, env.state, { kind: 'effect', request });
}

function enterEffect(env: Env, op: OpOf['effect'] | OpOf['with_effect']): StepResult {
  const params = evaluateAll(env, op.params);
  return params.ok ? requestOf(env, op, op.kind, { ...params.value }) : raise(env, params);
}

function settleOutputs(env: Env, op: { at: At }, resolved: NodeResult): StepResult {
  if (!resolved.ok) return raise(env, resolved);
  return next(env, setOutputs(env.state, op.at.key, resolved.value));
}

function settleRegion(env: Env, op: OpOf['with_effect'], resolved: NodeResult): StepResult {
  if (!resolved.ok) return raise(env, resolved);
  const state = setOutputs(env.state, op.at.key, resolved.value);
  if (op.body.op === 'seq' && op.body.ops.length === 0) return next(env, state);
  return enterScope(deriveEnv(env, state), `${env.path}/body`, 'body');
}

function skip(env: Env): StepResult {
  return next(env, env.state);
}

function invalid(env: Env, message: string): StepResult {
  return raise(env, { class: 'Invalid', message });
}

function refuse(message: string): Checked<never> {
  return { ok: false, class: 'Invalid', message };
}

type Action =
  | { readonly kind: 'set'; readonly value: JsonValue }
  | {
      readonly kind: 'change';
      readonly change: VarChange;
      readonly amount: JsonValue | undefined;
    };

function resolveAction(env: Env, op: OpOf['set_var']): Checked<Action> {
  if (op.mode === 'set') {
    if (op.to === undefined) return refuse(`${op.at.key} has no value to set`);
    const value = present(evaluate(env, op.to), 'the value');
    return value.ok ? ok({ kind: 'set', value: value.value }) : value;
  }
  if (op.change === undefined) return refuse(`${op.at.key} has no change to apply`);
  const amount = op.change.amount === undefined ? ok(undefined) : evaluate(env, op.change.amount);
  return amount.ok ? ok({ kind: 'change', change: op.change, amount: amount.value }) : amount;
}

interface VarResult {
  readonly value: JsonValue;
  readonly previous?: JsonValue | undefined;
  readonly wrapped?: boolean;
}

function varOutputs({ value, previous, wrapped }: VarResult): Record<string, JsonValue> {
  return {
    value,
    ...(previous === undefined ? {} : { previous }),
    ...(wrapped === undefined ? {} : { wrapped }),
  };
}

function applyRun(env: Env, op: OpOf['set_var'], target: string, action: Action): StepResult {
  const current = runVars(env.state)[target];
  const changed =
    action.kind === 'set'
      ? ok<VarResult>({ value: action.value, previous: current })
      : env.ctx.changeVar({ change: action.change, current, amount: action.amount });
  if (!changed.ok) return raise(env, changed);
  const outputs = varOutputs(changed.value);
  const state = setRunVar(env.state, target, changed.value.value);
  return next(env, setOutputs(state, op.at.key, outputs));
}

function changeJson(action: Extract<Action, { kind: 'change' }>): Record<string, JsonValue> {
  const { op, edge, field, steps } = action.change;
  return {
    op,
    edge,
    ...(field === undefined ? {} : { field }),
    ...(steps === undefined ? {} : { steps }),
    ...(action.amount === undefined ? {} : { amount: action.amount }),
  };
}

function requestVariable(
  env: Env,
  op: OpOf['set_var'],
  target: string,
  action: Action,
): StepResult {
  const kept =
    op.source === 'automation' ? keptParams(env, target) : ok<Record<string, JsonValue>>({});
  if (!kept.ok) return raise(env, kept);
  const base = { source: op.source, target, ...kept.value };
  if (action.kind === 'set') {
    return requestOf(env, op, 'var.set', { ...base, to: action.value });
  }
  return requestOf(env, op, 'var.change', { ...base, change: changeJson(action) });
}

function enterSetVar(env: Env, op: OpOf['set_var']): StepResult {
  const target = op.source === 'home' ? op.value : op.name;
  if (target === undefined) return invalid(env, `${op.at.key} names no variable`);
  const action = resolveAction(env, op);
  if (!action.ok) return raise(env, action);
  return op.source === 'run'
    ? applyRun(env, op, target, action.value)
    : requestVariable(env, op, target, action.value);
}

export const CORE_OPS: OpHandlers = {
  seq: { enter: (env) => enterScope(env, env.path, '') },
  branch: { enter: enterBranch },
  switch: { enter: enterSwitch },
  guard: { enter: enterGuard },
  compute: { enter: skip },
  read: { enter: skip },
  set_var: { enter: enterSetVar, settle: settleOutputs },
  effect: { enter: enterEffect, settle: settleOutputs },
  with_effect: { enter: enterEffect, settle: settleRegion },
  return: { enter: enterReturn },
  stop: { enter: enterStop },
  fail: { enter: enterFail },
};

export const CORE_FRAMES: FrameHandlers = { root: endRun, branch: scopeFrame };
