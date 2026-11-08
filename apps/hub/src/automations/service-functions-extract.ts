import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AUTOMATION_V4,
  FUNCTION_V4,
  EMPTY_LAYOUT,
  type AutomationFunctionExtractReply,
  type AutomationFunctionExtractRequest,
  type AutomationProgramProblem,
  type StoredAutomationRow,
  type AutomationV4,
  type FunctionRow,
  type FunctionV4,
} from '@smarteverything/domain';
import { extractFromGraph } from '@smarteverything/flow/graph/extract-graph';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import { profileIdOf, type Caller } from '../server/auth';
import { analyse, failure, lintContextOf, planValue } from './service-programs-analysis';
import { authorSpeech } from './service-programs-speech';
import { authorOf } from './service-reach';
import { authorise, hashOf, requireFreeName, type FunctionsEnv } from './service-functions-support';

class Rollback extends Error {
  override readonly name = 'Rollback';

  constructor(readonly problems: readonly AutomationProgramProblem[]) {
    super('The change was rolled back.');
  }
}

interface Extraction {
  readonly request: AutomationFunctionExtractRequest;
  readonly row: StoredAutomationRow;
  readonly functionId: string;
  readonly callee: FunctionV4;
  readonly caller: AutomationV4;
  readonly instanceKey: string;
}

interface PortEdit {
  readonly name: string;
  readonly label?: string | undefined;
  readonly description?: string | undefined;
}

function edited<T extends { readonly name: string }>(
  ports: readonly T[],
  edits: readonly PortEdit[] | undefined,
  kind: string,
): T[] {
  const known = new Set(ports.map((port) => port.name));
  for (const change of edits ?? []) {
    if (!known.has(change.name)) {
      throw new ApiError('invalid_request', `The new Custom Node has no ${kind} ${change.name}.`);
    }
  }
  return ports.map((port) => {
    const change = edits?.find((candidate) => candidate.name === port.name);
    const { name: _name, ...text } = change ?? {};
    return { ...port, ...text };
  });
}

function refusedExtract(
  request: AutomationFunctionExtractRequest,
  problems: readonly AutomationProgramProblem[],
  suggestion: readonly string[],
): AutomationFunctionExtractReply {
  return {
    ok: false,
    summary: 'Nothing was extracted.',
    id: null,
    revision: null,
    compat: null,
    changes: [],
    affected: [],
    problems: [...problems],
    automationId: request.automationId,
    callerRevision: null,
    instanceKey: null,
    suggestion: [...suggestion],
  };
}

function createCallee(
  env: FunctionsEnv,
  caller: Caller,
  found: Extraction,
  calleePlan: ReturnType<typeof planValue>,
): FunctionRow {
  return env.functions.create(
    {
      id: found.functionId,
      name: found.request.name,
      program: found.callee,
      layout: EMPTY_LAYOUT,
      interfaceHash: hashOf(found.callee),
      compat: 'compatible',
      planHash: env.plans.put('function', calleePlan),
      author: authorOf(env.store, caller),
      createdBy: profileIdOf(env.store, caller),
    },
    env.kinds,
  );
}

function saveExtraction(
  env: FunctionsEnv,
  caller: Caller,
  found: Extraction,
  calleePlan: ReturnType<typeof planValue>,
): AutomationFunctionExtractReply {
  const author = authorOf(env.store, caller);
  const created = createCallee(env, caller, found, calleePlan);
  const program = found.caller;
  const analysis = analyse(env, program);
  if (analysis.built === undefined) throw new Rollback(analysis.problems);
  authorise(env, caller, program, analysis.built);
  const saved = env.programs.replace(
    found.row.id,
    {
      program,
      layout: found.row.layout,
      expectedRevision: found.row.revision,
      planHash: env.plans.put('automation', planValue(analysis.built.plan)),
      author,
    },
    env.kinds,
  );
  env.store.harnessRecovery.effects.keep('automation', saved.id, currentExecutionAuthority());
  authorSpeech(env.store, caller, saved);
  return {
    ok: true,
    summary: `Made ${created.name} and saved revision ${String(saved.revision)} of ${saved.name}.`,
    id: created.id,
    revision: created.latest_revision,
    compat: 'compatible',
    changes: [],
    affected: [],
    problems: analysis.problems.filter((problem) => problem.severity !== 'error'),
    automationId: saved.id,
    callerRevision: saved.revision,
    instanceKey: found.instanceKey,
    suggestion: [],
  };
}

function commit(
  env: FunctionsEnv,
  caller: Caller,
  found: Extraction,
): AutomationFunctionExtractReply {
  const analysis = analyse(env, found.callee);
  if (analysis.built === undefined) return refusedExtract(found.request, analysis.problems, []);
  authorise(env, caller, found.callee, analysis.built);
  const plan = planValue(analysis.built.plan);
  try {
    return env.store.write(() => saveExtraction(env, caller, found, plan));
  } catch (cause) {
    if (cause instanceof Rollback) return refusedExtract(found.request, cause.problems, []);
    throw cause;
  }
}

export function extract(
  env: FunctionsEnv,
  caller: Caller,
  request: AutomationFunctionExtractRequest,
): AutomationFunctionExtractReply {
  requireFreeName(env, request.name);
  const row = env.programs.byId(request.automationId);
  if (row.revision !== request.expectedRevision) {
    throw new ApiError(
      'conflict',
      'The automation changed since it was read. Reload it and save again.',
    );
  }
  const functionId = randomUUID();
  const result = extractFromGraph(row.definition, request.keys, lintContextOf(env), {
    functionId,
    newId: randomUUID,
    name: request.name,
    ...(request.expose === undefined ? {} : { expose: request.expose }),
  });
  if (!result.ok) {
    return refusedExtract(request, [failure(result.code, result.reason)], result.suggestion);
  }
  const extracted = FUNCTION_V4.parse(unstructure(result.callee, env.kinds));
  const callee = {
    ...extracted,
    inputs: edited(extracted.inputs, request.inputs, 'input'),
    outputs: edited(extracted.outputs, request.outputs, 'output'),
  };
  return commit(env, caller, {
    request,
    row,
    functionId,
    callee,
    caller: AUTOMATION_V4.parse(unstructure(result.caller, env.kinds)),
    instanceKey: result.instanceKey,
  });
}
