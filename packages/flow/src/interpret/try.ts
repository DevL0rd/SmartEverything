import { FLOW_ERROR, JSON_VALUE, jsonEquals } from '@smarteverything/domain';
import type { FlowError, JsonValue } from '@smarteverything/domain';
import { isCatchable } from '../state/errors';
import type { Completion, Frame, RunState, TryState } from '../state/run-state';
import { beginCleanup } from './cancel';
import type { Checked, Env, FrameHandlers, OpHandlers, OpOf, StepResult } from './frames';
import {
  InterpreterError,
  absorb,
  asRecord,
  completeFrame,
  deriveEnv,
  errorFor,
  newFrame,
  next,
  popFrame,
  pushFrame,
  setOutputs,
  stay,
  topFrame,
  withTop,
} from './frames';
import { evaluate } from './step';

const NORMAL: Completion = { kind: 'normal' };

interface Site {
  readonly op: OpOf['try'];
  readonly path: string;
}

function siteOf(env: Env): Site {
  const parent = deriveEnv(env, popFrame(env.state));
  if (parent.op?.op !== 'try') {
    throw new InterpreterError(
      'a try frame',
      'a try operation in its parent',
      parent.op?.op ?? 'none',
    );
  }
  return { op: parent.op, path: parent.path };
}

function tryStateOf(frame: Frame): TryState {
  if (frame.tryState === undefined) {
    throw new InterpreterError('a try frame', 'a try state', 'none');
  }
  return frame.tryState;
}

function moveTo(state: RunState, path: string, tryState: TryState): RunState {
  const prefix = `${topFrame(state).id}:`;
  const moved = withTop(state, (frame) => ({ ...frame, path, pc: 0, tryState }));
  return {
    ...moved,
    captures: Object.fromEntries(
      Object.entries(moved.captures).filter(([key]) => !key.startsWith(prefix)),
    ),
  };
}

function enterTry(env: Env): StepResult {
  const frame: Frame = {
    ...newFrame(env.state, 'try', `${env.path}/body`),
    tryState: { phase: 'body', completion: NORMAL },
  };
  return stay(env, pushFrame(env.state, frame));
}

interface Found {
  readonly index: number;
  readonly row: OpOf['try']['catches'][number];
}

function rowFor(op: OpOf['try'], error: FlowError): Found | undefined {
  for (const [index, row] of op.catches.entries()) {
    if (row.classes === undefined || row.classes.includes(error.class)) return { index, row };
  }
  return undefined;
}

function enterCatch(env: Env, site: Site, found: Found, error: FlowError): StepResult {
  const marked = setOutputs(env.state, site.op.at.key, { error: JSON_VALUE.parse(error) });
  const path = `${site.path}/catches/${String(found.index)}/then`;
  return stay(env, moveTo(marked, path, { phase: 'catch', row: found.row.id, completion: NORMAL }));
}

function producedOutputs(env: Env, site: Site, scope: string): Checked<Record<string, JsonValue>> {
  const values: Record<string, JsonValue> = {};
  for (const output of site.op.outputs ?? []) {
    const port = output.values[scope];
    if (port === undefined) continue;
    const evaluated = evaluate(env, port);
    if (!evaluated.ok) return evaluated;
    if (evaluated.value !== undefined) values[output.name] = evaluated.value;
  }
  return { ok: true, value: values };
}

function exit(env: Env, site: Site, state: RunState, completion: Completion): StepResult {
  const joined = topFrame(state).joinedOutputs;
  const popped = popFrame(absorb(env, state));
  const parent = deriveEnv(env, popped);
  if (completion.kind !== 'normal') return completeFrame(parent, completion);
  const kept =
    site.op.outputs === undefined ? popped : setOutputs(popped, site.op.at.key, asRecord(joined));
  return next(parent, kept);
}

function startFinally(env: Env, site: Site, state: RunState, completion: Completion): StepResult {
  const moved = moveTo(state, `${site.path}/finally`, { phase: 'finally', completion });
  const cleaned =
    completion.kind === 'cancelled' ? beginCleanup(moved, completion.reason, env.now) : moved;
  return stay(env, cleaned);
}

function leave(env: Env, site: Site, state: RunState, completion: Completion): StepResult {
  return site.op.finally === undefined
    ? exit(env, site, state, completion)
    : startFinally(env, site, state, completion);
}

function settleScope(env: Env, site: Site, completion: Completion, scope: string): StepResult {
  if (completion.kind !== 'normal') return leave(env, site, env.state, completion);
  const produced = producedOutputs(env, site, scope);
  if (!produced.ok) {
    return leave(env, site, env.state, { kind: 'error', error: errorFor(env, produced) });
  }
  const state = withTop(env.state, (frame) => ({ ...frame, joinedOutputs: produced.value }));
  return leave(env, site, state, NORMAL);
}

function afterBody(env: Env, site: Site, completion: Completion): StepResult {
  if (completion.kind === 'error' && isCatchable(completion.error)) {
    const found = rowFor(site.op, completion.error);
    if (found !== undefined) return enterCatch(env, site, found, completion.error);
  }
  return settleScope(env, site, completion, 'try');
}

function withOriginalLast(error: FlowError, original: FlowError): FlowError {
  if (jsonEquals(JSON_VALUE.parse(error), JSON_VALUE.parse(original))) return error;
  if (error.cause === undefined) return { ...error, cause: original };
  return { ...error, cause: withOriginalLast(FLOW_ERROR.parse(error.cause), original) };
}

function replaced(original: Completion, error: FlowError): Completion {
  if (original.kind !== 'error') return { kind: 'error', error };
  return { kind: 'error', error: withOriginalLast(error, original.error) };
}

function afterFinally(env: Env, site: Site, completion: Completion): StepResult {
  const saved = tryStateOf(env.frame).completion;
  if (completion.kind === 'normal') return exit(env, site, env.state, saved);
  if (completion.kind === 'error') {
    return exit(env, site, env.state, replaced(saved, completion.error));
  }
  return exit(env, site, env.state, completion);
}

function tryFrame(env: Env, completion: Completion): StepResult {
  const site = siteOf(env);
  const { phase, row } = tryStateOf(env.frame);
  switch (phase) {
    case 'body':
      return afterBody(env, site, completion);
    case 'catch':
      if (row === undefined) throw new InterpreterError('a catch phase', 'a catch row', 'none');
      return settleScope(env, site, completion, row);
    case 'finally':
      return afterFinally(env, site, completion);
  }
}

export const TRY_OPS: OpHandlers = { try: { enter: enterTry } };

export const TRY_FRAMES: FrameHandlers = { try: tryFrame };
