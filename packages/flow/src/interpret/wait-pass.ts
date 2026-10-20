import type { OpOf, Outputs, Env, StepResult } from './frames';
import { deriveEnv, next, setOutputs } from './frames';
import { enterScope } from './core-ops';

export interface Passing {
  readonly at: { readonly key: string };
  readonly scopes?: OpOf['wait']['scopes'];
}

export const TIMED_OUT = 'timedOut';

export function pass(env: Env, op: Passing, outputs: Outputs): StepResult {
  const state = setOutputs(env.state, op.at.key, outputs);
  const lane = outputs[TIMED_OUT] === true ? op.scopes?.[TIMED_OUT] : undefined;
  if (lane === undefined) return next(env, state);
  return enterScope(deriveEnv(env, state), `${env.path}/scopes/${TIMED_OUT}`, TIMED_OUT);
}
