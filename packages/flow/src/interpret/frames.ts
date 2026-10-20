import { JSON_VALUE } from '@smarteverything/domain';
import type { ErrorClass, FlowError, JsonValue } from '@smarteverything/domain';
import { z } from 'zod';
import type { Plan, PlanOp } from '../compile/plan';
import type { At, VarChange } from '../compile/plan-parts';
import type { BudgetLimits } from '../state/budgets';
import { FLOW_ERRORS } from '../state/errors';
import type { CancelReason, Completion, Frame, RunState } from '../state/run-state';
import type { Wait } from '../state/run-state';
import type { KeptScope, KeptStart } from './kept-types';

export type Outputs = Readonly<Record<string, JsonValue>>;

export interface Failure {
  readonly class: ErrorClass;
  readonly message: string;
}

export type Checked<T> =
  { readonly ok: true; readonly value: T } | ({ readonly ok: false } & Failure);

export type Evaluated = Checked<JsonValue | undefined>;

export type NodeResult = Checked<Outputs>;

export interface PortThunks {
  readonly names: readonly string[];
  readonly get: (name: string) => Evaluated | undefined;
}

export interface PureRequest {
  readonly kind: string;
  readonly node: At;
  readonly ports: PortThunks;
}

export interface PureEvaluator {
  readonly evaluate: (request: PureRequest) => NodeResult;
}

export interface ReadRequest {
  readonly kind: string;
  readonly node: At;
  readonly inputs: Outputs;
  readonly seed: number;
  readonly activation: string;
  readonly instance: string;
  readonly kept: (name: string) => Checked<KeptStart | undefined>;
}

export interface ReadPort {
  readonly node: (request: ReadRequest) => NodeResult;
  readonly variable: (name: string, kept?: KeptScope) => Evaluated;
}

export interface VarChangeRequest {
  readonly change: VarChange;
  readonly current: JsonValue | undefined;
  readonly amount: JsonValue | undefined;
}

export type VarChangeResult = Checked<{
  readonly value: JsonValue;
  readonly previous?: JsonValue | undefined;
  readonly wrapped: boolean;
}>;

export type EffectOp = Extract<PlanOp, { op: 'effect' }>;

export interface EffectRequest {
  readonly kind: string;
  readonly node: At;
  readonly path: string;
  readonly activation: string;
  readonly key: string;
  readonly params: Outputs;
  readonly retry: EffectOp['retry'];
  readonly budget: EffectOp['budget'];
}

export type StepEvent =
  | { readonly kind: 'start'; readonly now: number }
  | { readonly kind: 'run'; readonly now: number }
  | { readonly kind: 'resolved'; readonly now: number; readonly result: NodeResult };

export type Outcome =
  | { readonly kind: 'continue' }
  | { readonly kind: 'effect'; readonly request: EffectRequest }
  | { readonly kind: 'park'; readonly wait: Wait }
  | {
      readonly kind: 'done';
      readonly status: 'succeeded' | 'cancelled';
      readonly exit: string;
      readonly outputs: Outputs;
      readonly reason?: CancelReason | undefined;
    }
  | { readonly kind: 'failed'; readonly error: FlowError };

export type StepRecord =
  | {
      readonly kind: 'capture';
      readonly activation: string;
      readonly node: string;
      readonly value: JsonValue;
    }
  | { readonly kind: 'note'; readonly node: string; readonly message: string }
  | {
      readonly kind: 'node';
      readonly activation: string;
      readonly node: string;
      readonly status: 'running' | 'waiting' | 'succeeded' | 'failed' | 'cancelled';
      readonly error?: FlowError;
    };

export interface StepResult {
  readonly state: RunState;
  readonly outcome: Outcome;
  readonly records: readonly StepRecord[];
}

export type OpName = PlanOp['op'];

export type OpOf = { readonly [K in OpName]: Extract<PlanOp, { op: K }> };

export interface OpHandler<O extends PlanOp> {
  readonly enter: (env: Env, op: O) => StepResult;
  readonly settle?: (env: Env, op: O, result: NodeResult) => StepResult;
}

export type OpHandlers = { readonly [K in OpName]?: OpHandler<OpOf[K]> };

export type FrameHandler = (env: Env, completion: Completion) => StepResult;

export type FrameHandlers = Readonly<Partial<Record<Frame['kind'], FrameHandler>>>;

export interface StepContext {
  readonly plan: (frame: Frame, state: RunState) => Plan;
  readonly pure: (kind: string) => PureEvaluator | undefined;
  readonly reads: ReadPort;
  readonly changeVar: (request: VarChangeRequest) => VarChangeResult;
  readonly limits: BudgetLimits;
  readonly home: Readonly<Record<string, JsonValue>>;
  readonly ops: OpHandlers;
  readonly frames: FrameHandlers;
}

export interface Scratch {
  readonly memo: Map<string, NodeResult>;
  readonly captured: Map<string, JsonValue>;
  readonly records: StepRecord[];
}

export interface Env {
  readonly ctx: StepContext;
  readonly state: RunState;
  readonly frame: Frame;
  readonly plan: Plan;
  readonly now: number;
  readonly op: PlanOp | undefined;
  readonly at: At;
  readonly path: string;
  readonly activation: string;
  readonly scratch: Scratch;
}

export class InterpreterError extends Error {
  override readonly name = 'InterpreterError';

  constructor(
    readonly subject: string,
    readonly expected: string,
    readonly received: string,
  ) {
    super(`The interpreter was refused at ${subject}: expected ${expected}, received ${received}.`);
  }
}

export const DEFAULT_EXIT = 'done';
export const RETURN_KEY = '$return';
export const STOP_KEY = '$stop';

const JSON_RECORD = z.record(z.string(), JSON_VALUE);

const CONTINUE: Outcome = { kind: 'continue' };

function isPlanOp(value: unknown): value is PlanOp {
  return (
    typeof value === 'object' && value !== null && 'op' in value && typeof value.op === 'string'
  );
}

export function planAt(plan: Plan, path: string): PlanOp {
  const found = path
    .split('/')
    .reduce<unknown>(
      (value, segment) =>
        typeof value === 'object' && value !== null ? Reflect.get(value, segment) : undefined,
      plan,
    );
  if (isPlanOp(found)) return found;
  throw new InterpreterError('a frame path', 'a plan operation', path);
}

export function opsOf(root: PlanOp): readonly PlanOp[] {
  return root.op === 'seq' ? root.ops : [root];
}

export function rootFrame(path: 'body' | 'onFailure' = 'body'): Frame {
  return { id: 'f0', kind: 'root', path, pc: 0, locals: {}, outputs: {} };
}

export function newFrame(
  state: RunState,
  kind: Frame['kind'],
  path: string,
  locals: Frame['locals'] = {},
): Frame {
  return { id: `f${String(state.budgets.steps)}`, kind, path, pc: 0, locals, outputs: {} };
}

export function topFrame(state: RunState): Frame {
  const frame = state.frames.at(-1);
  if (frame === undefined) throw new InterpreterError('the frame stack', 'a frame', 'none');
  return frame;
}

function activationOf(frame: Frame): string {
  return `${frame.id}:${String(frame.pc)}`;
}

function pruned(captures: RunState['captures'], prefix: string): RunState['captures'] {
  return Object.fromEntries(Object.entries(captures).filter(([key]) => !key.startsWith(prefix)));
}

function replaceAt(state: RunState, index: number, update: (frame: Frame) => Frame): RunState {
  return {
    ...state,
    frames: state.frames.map((frame, at) => (at === index ? update(frame) : frame)),
  };
}

export function withTop(state: RunState, update: (frame: Frame) => Frame): RunState {
  return replaceAt(state, state.frames.length - 1, update);
}

export function pushFrame(state: RunState, frame: Frame): RunState {
  return { ...state, frames: [...state.frames, frame] };
}

export function popFrame(state: RunState): RunState {
  const top = topFrame(state);
  return {
    ...state,
    frames: state.frames.slice(0, -1),
    captures: pruned(state.captures, `${top.id}:`),
  };
}

export function advance(state: RunState): RunState {
  const prefix = `${activationOf(topFrame(state))}/`;
  const moved = withTop(state, (frame) => ({ ...frame, pc: frame.pc + 1 }));
  return { ...moved, captures: pruned(state.captures, prefix) };
}

export function setOutputs(state: RunState, key: string, outputs: JsonValue): RunState {
  return withTop(state, (frame) => ({ ...frame, outputs: { ...frame.outputs, [key]: outputs } }));
}

function owner(state: RunState): Frame {
  const frame = state.frames.findLast((held) => held.kind === 'root' || held.kind === 'call');
  if (frame === undefined)
    throw new InterpreterError('the frame stack', 'a root or call frame', 'none');
  return frame;
}

function ownerIndex(state: RunState): number {
  return state.frames.indexOf(owner(state));
}

export function setOwnerOutputs(state: RunState, key: string, outputs: JsonValue): RunState {
  return replaceAt(state, ownerIndex(state), (frame) => ({
    ...frame,
    outputs: { ...frame.outputs, [key]: outputs },
  }));
}

export function setRootOutputs(state: RunState, key: string, outputs: JsonValue): RunState {
  return replaceAt(state, 0, (frame) => ({
    ...frame,
    outputs: { ...frame.outputs, [key]: outputs },
  }));
}

export function runVars(state: RunState): Frame['locals'] {
  return owner(state).locals;
}

export function setRunVar(state: RunState, name: string, value: JsonValue): RunState {
  return replaceAt(state, ownerIndex(state), (frame) => ({
    ...frame,
    locals: { ...frame.locals, [name]: value },
  }));
}

export function asRecord(value: JsonValue | undefined): Outputs {
  const parsed = JSON_RECORD.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function lookupOutput(state: RunState, key: string): JsonValue | undefined {
  const boundary = Math.max(
    state.frames.findLastIndex((frame) => frame.kind === 'call'),
    0,
  );
  const owner = state.frames.slice(boundary).findLast((frame) => Object.hasOwn(frame.outputs, key));
  return owner?.outputs[key];
}

export function siteOf(env: Env): { node: string; path: string; at: number } {
  return { node: env.at.id, path: env.path, at: env.now };
}

export function errorFor(env: Env, failure: Failure): FlowError {
  return FLOW_ERRORS[failure.class](failure.message, siteOf(env));
}

export function makeEnv(
  ctx: StepContext,
  state: RunState,
  now: number,
  scratch: Scratch = { memo: new Map(), captured: new Map(), records: [] },
): Env {
  const frame = topFrame(state);
  const plan = ctx.plan(frame, state);
  const root = planAt(plan, frame.path);
  const op = opsOf(root)[frame.pc];
  const at = op !== undefined && 'at' in op ? op.at : { id: state.automationId, key: 'run' };
  const path = root.op === 'seq' ? `${frame.path}/ops/${String(frame.pc)}` : frame.path;
  return { ctx, state, frame, plan, now, op, at, path, activation: activationOf(frame), scratch };
}

export function deriveEnv(env: Env, state: RunState): Env {
  return makeEnv(env.ctx, state, env.now, { ...env.scratch, memo: new Map() });
}

export function absorb(env: Env, state: RunState): RunState {
  const merged = {
    ...state,
    captures: { ...state.captures, ...Object.fromEntries(env.scratch.captured) },
  };
  env.scratch.captured.clear();
  return merged;
}

export function result(env: Env, state: RunState, outcome: Outcome = CONTINUE): StepResult {
  return { state, outcome, records: env.scratch.records };
}

export function stay(env: Env, state: RunState, outcome: Outcome = CONTINUE): StepResult {
  return result(env, absorb(env, state), outcome);
}

export function next(env: Env, state: RunState): StepResult {
  return result(env, advance(absorb(env, state)));
}

export function note(env: Env, message: string): void {
  env.scratch.records.push({ kind: 'note', node: env.at.key, message });
}

export function completeFrame(env: Env, completion: Completion): StepResult {
  const handler = env.ctx.frames[env.frame.kind];
  if (handler === undefined) return unsupported(env, `the frame kind ${env.frame.kind}`);
  return handler(env, completion);
}

export function complete(env: Env, state: RunState, completion: Completion): StepResult {
  return completeFrame(deriveEnv(env, state), completion);
}

export function propagate(env: Env, completion: Completion): StepResult {
  return completeFrame(deriveEnv(env, popFrame(absorb(env, env.state))), completion);
}

export function executes(op: PlanOp | undefined): boolean {
  return op !== undefined && 'at' in op && op.op !== 'compute' && op.op !== 'read';
}

export function ownsScope(op: PlanOp | undefined): boolean {
  return op?.op === 'branch' || op?.op === 'switch' || op?.op === 'with_effect';
}

export function tracesAtEnd(op: PlanOp | undefined): boolean {
  return op?.op === 'loop' && !(op.source.kind === 'items' && op.source.concurrency > 1);
}

export function atLoopLevel(env: Env): boolean {
  return tracesAtEnd(env.op) && env.frame.kind === 'loop';
}

export function traceNode(
  env: Env,
  status: Extract<StepRecord, { kind: 'node' }>['status'],
  error?: FlowError,
): void {
  env.scratch.records.push({
    kind: 'node',
    activation: env.activation,
    node: env.at.key,
    status,
    ...(error === undefined ? {} : { error }),
  });
}

export function raise(env: Env, failure: Failure): StepResult {
  const error = errorFor(env, failure);
  if (executes(env.op) && !atLoopLevel(env)) traceNode(env, 'failed', error);
  return completeFrame(env, { kind: 'error', error });
}

export function unsupported(env: Env, what: string): StepResult {
  const error = errorFor(env, {
    class: 'Failed',
    message: `no interpreter is registered for ${what}`,
  });
  return result(env, env.state, { kind: 'failed', error });
}

function describe(value: JsonValue | undefined): string {
  return value === undefined ? 'nothing' : JSON.stringify(value);
}

export function mismatch<T>(
  label: string,
  expected: string,
  value: JsonValue | undefined,
): Checked<T> {
  return {
    ok: false,
    class: 'TypeError',
    message: `${label} must be ${expected}, received ${describe(value)}`,
  };
}

export function boolean(evaluated: Evaluated, label: string): Checked<boolean> {
  if (!evaluated.ok) return evaluated;
  const { value } = evaluated;
  return typeof value === 'boolean' ? { ok: true, value } : mismatch(label, 'true or false', value);
}

export function text(evaluated: Evaluated, label: string): Checked<string> {
  if (!evaluated.ok) return evaluated;
  const { value } = evaluated;
  return typeof value === 'string' ? { ok: true, value } : mismatch(label, 'text', value);
}

export function present(evaluated: Evaluated, label: string): Checked<JsonValue> {
  if (!evaluated.ok) return evaluated;
  const { value } = evaluated;
  return value === undefined ? mismatch(label, 'a value', value) : { ok: true, value };
}
