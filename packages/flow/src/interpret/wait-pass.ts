import type { OpOf, Outputs, Env, StepResult } from './frames';
import { deriveEnv, next, setOutputs } from './frames';
import { TIMED_OUT, enterScope } from './scope-entry';

export interface Passing {
  readonly at: { readonly key: string };
  readonly scopes?: OpOf['wait']['scopes'];
}

export { TIMED_OUT };

export function pass(env: Env, op: Passing, outputs: Outputs): StepResult {
  const state = setOutputs(env.state, op.at.key, outputs);
  const lane = outputs[TIMED_OUT] === true ? op.scopes?.[TIMED_OUT] : undefined;
  if (lane === undefined) return next(env, state);
  return enterScope(deriveEnv(env, state), `${env.path}/scopes/${TIMED_OUT}`, TIMED_OUT);
}
