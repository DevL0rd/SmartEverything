import type { JsonValue } from '@smarteverything/domain';
import { ancestryBreach } from '../state/budgets';
import { breachError } from '../state/errors';
import type { NodeResult, Env, OpHandlers, OpOf, StepResult } from './frames';
import { completeFrame, next, raise, setOutputs, siteOf, stay } from './frames';
import { evaluateAll } from './step';

export const RUN_AUTOMATION_KIND = 'automation.run';

interface Link {
  readonly automationId: string;
  readonly runId: string;
}

function chainOf(env: Env): readonly Link[] {
  const { causeChain, automationId, runId } = env.state;
  return [...causeChain, { automationId, runId }];
}

function refusal(env: Env, op: OpOf['run'], chain: readonly Link[]): StepResult | null {
  if (!op.allowSelf && chain.some((link) => link.automationId === op.automation)) {
    return raise(env, {
      class: 'Forbidden',
      message: `${op.automation} is already part of this chain of runs and the node does not allow itself`,
    });
  }
  const breach = ancestryBreach(chain.length, env.ctx.limits);
  if (breach === null) return null;
  const error = breachError(breach, siteOf(env), env.state.runId);
  return completeFrame(env, { kind: 'error', error });
}

function request(env: Env, op: OpOf['run'], inputs: JsonValue, chain: readonly Link[]): StepResult {
  return stay(env, env.state, {
    kind: 'effect',
    request: {
      kind: RUN_AUTOMATION_KIND,
      node: op.at,
      path: env.path,
      activation: env.activation,
      key: `${env.state.runId}/${env.activation}`,
      params: {
        automation: op.automation,
        inputs,
        wait: op.wait,
        parentRunId: env.state.runId,
        causeChain: chain.map((link) => ({ ...link })),
      },
      retry: 'external',
      budget: 'none',
    },
  });
}

function enterRun(env: Env, op: OpOf['run']): StepResult {
  const chain = chainOf(env);
  const refused = refusal(env, op, chain);
  if (refused !== null) return refused;
  const inputs = evaluateAll(env, op.inputs);
  return inputs.ok ? request(env, op, { ...inputs.value }, chain) : raise(env, inputs);
}

function settleRun(env: Env, op: OpOf['run'], result: NodeResult): StepResult {
  if (!result.ok) return raise(env, result);
  return next(env, setOutputs(env.state, op.at.key, op.wait ? result.value : {}));
}

export const RUN_OPS: OpHandlers = { run: { enter: enterRun, settle: settleRun } };
