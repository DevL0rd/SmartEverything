import { background } from '@smarteverything/logging';
import {
  AUTOMATION_V4,
  type AutomationFunctionCallersReply,
  type AutomationFunctionDetail,
  type AutomationFunctionExtractReply,
  type AutomationFunctionExtractRequest,
  type AutomationFunctionMapping,
  type AutomationFunctionReply,
  type AutomationFunctionSummary,
} from '@smarteverything/domain';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import type { Caller } from '../server/auth';
import type { CreateFunctionInput, FunctionSaveInput, NewFunctionInput } from './function-units';
import { pluginKindsOf, programData } from './program-data';
import { admitReach } from './reach-admission';
import type { Reached } from './service-reach';
import type { ProgramEnv } from './service-programs';
import { speechPlan } from './service-programs-speech';

export type FunctionsEnv = ProgramEnv;

type FunctionTurn = Omit<CreateFunctionInput, 'input'>;

export interface AutomationFunctions {
  readonly list: (caller: Caller) => Promise<AutomationFunctionSummary[]>;
  readonly get: (caller: Caller, id: string) => Promise<AutomationFunctionDetail>;
  readonly create: (caller: Caller, input: NewFunctionInput) => Promise<AutomationFunctionReply>;
  readonly save: (
    caller: Caller,
    id: string,
    input: FunctionSaveInput,
  ) => Promise<AutomationFunctionReply>;
  readonly updateCallers: (
    caller: Caller,
    id: string,
    mapping: AutomationFunctionMapping,
  ) => Promise<AutomationFunctionCallersReply>;
  readonly extract: (
    caller: Caller,
    request: AutomationFunctionExtractRequest,
  ) => Promise<AutomationFunctionExtractReply>;
  readonly remove: (caller: Caller, id: string) => Promise<void>;
}

async function updateCallers(
  env: FunctionsEnv,
  caller: Caller,
  id: string,
  mapping: AutomationFunctionMapping,
): Promise<AutomationFunctionCallersReply> {
  const authority = currentExecutionAuthority();
  const read = await env.store.host.read('prepareFunctionCallers', {
    data: programData(env.kinds, env.secrets),
    caller,
    authority,
    id,
    mapping,
  });
  const prepared = admitReach(env.store, caller, read);
  if (prepared.kind === 'done') return prepared.reply;
  const targets = await Promise.all(
    prepared.targets.map(async (target) => ({
      ...target,
      speech:
        target.automation === null
          ? null
          : await speechPlan(env.store, caller, AUTOMATION_V4.parse(target.program), target.prior),
    })),
  );
  const updated = await env.store.host.write('commitFunctionCallers', {
    kinds: pluginKindsOf(env.kinds),
    caller,
    authority,
    targets,
  });
  return {
    ok: true,
    summary: `Updated ${String(updated.length)} caller(s).`,
    updated,
    problems: [],
  };
}

async function extract(
  env: FunctionsEnv,
  caller: Caller,
  request: AutomationFunctionExtractRequest,
): Promise<AutomationFunctionExtractReply> {
  const authority = currentExecutionAuthority();
  const read = await env.store.host.read('prepareFunctionExtract', {
    data: programData(env.kinds, env.secrets),
    caller,
    authority,
    request,
  });
  const ready = admitReach(env.store, caller, read);
  if (ready.kind === 'done') return ready.reply;
  const speech = await speechPlan(env.store, caller, ready.found.caller, ready.prior);
  return env.store.host.write('commitFunctionExtract', {
    kinds: pluginKindsOf(env.kinds),
    caller,
    authority,
    ready,
    speech,
  });
}

async function changed<T>(env: FunctionsEnv, work: Promise<T>): Promise<T> {
  const result = await work;
  background(env.engine.functionsChanged(), 'automation.reload_failed');
  return result;
}

export function automationFunctions(env: FunctionsEnv): AutomationFunctions {
  const { host } = env.store;
  const turn = (caller: Caller): FunctionTurn => ({
    data: programData(env.kinds, env.secrets),
    caller,
    authority: currentExecutionAuthority(),
  });
  const admitted = async <T>(caller: Caller, work: Promise<Reached<T>>): Promise<T> =>
    admitReach(env.store, caller, await work);
  return {
    list: (caller) => host.read('automationFunctions', caller),
    get: (caller, id) => host.read('automationFunction', { caller, id }),
    create: (caller, input) =>
      changed(
        env,
        admitted(caller, host.write('createAutomationFunction', { ...turn(caller), input })),
      ),
    save: (caller, id, input) =>
      changed(
        env,
        admitted(caller, host.write('saveAutomationFunction', { ...turn(caller), id, input })),
      ),
    updateCallers: (caller, id, mapping) => updateCallers(env, caller, id, mapping),
    extract: (caller, request) => extract(env, caller, request),
    remove: (caller, id) => changed(env, host.write('removeAutomationFunction', { caller, id })),
  };
}
