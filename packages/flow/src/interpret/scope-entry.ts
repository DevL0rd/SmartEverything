import type { Frame } from '../state/run-state';
import type { Env, NodeResult, OpOf, StepResult } from './frames';
import { deriveEnv, newFrame, next, pushFrame, raise, setOutputs, stay } from './frames';

type Locals = Frame['locals'];

export const TIMED_OUT = 'timedOut';

export function enterScope(env: Env, path: string, scope: string, extra: Locals = {}): StepResult {
  const frame = newFrame(env.state, 'branch', path, { scope, ...extra });
  return stay(env, pushFrame(env.state, frame));
}

export function settleEffect(env: Env, op: OpOf['effect'], resolved: NodeResult): StepResult {
  if (!resolved.ok) return raise(env, resolved);
  const state = setOutputs(env.state, op.at.key, resolved.value);
  const lane = resolved.value[TIMED_OUT] === true ? op.scopes?.[TIMED_OUT] : undefined;
  if (lane === undefined) return next(env, state);
  return enterScope(deriveEnv(env, state), `${env.path}/scopes/${TIMED_OUT}`, TIMED_OUT);
}
