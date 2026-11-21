import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AUTOMATION_V4,
  FUNCTION_V4,
  EMPTY_LAYOUT,
  type AutomationFunctionExtractReply,
  type AutomationFunctionExtractRequest,
  type AutomationProgramProblem,
  type AutomationV4,
  type FunctionV4,
  type JsonValue,
  type Layout,
  type NodeKind,
} from '@smarteverything/domain';
import { extractFromGraph } from '@smarteverything/flow/graph/extract-graph';
import { unstructure } from '@smarteverything/flow/graph/unstructure';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import { profileIdOf, type Caller } from '../server/auth';
import { storeUnit } from '../store/host/unit';
import type { Store } from '../store/store';
import type { SpeechPrincipal } from '../transcripts/speech-principal';
import type { ProgramData } from './program-data';
import { unitKinds } from './program-kinds';
import { applySpeech, priorSpeech, type SpeechPlan } from './program-speech';
import {
  analyse,
  analysisEnv,
  failure,
  lintContextOf,
  planValue,
  type AnalysisEnv,
  type Built,
} from './service-programs-analysis';
import { authorOf, reached, type Reached } from './service-reach';
import { authorise, hashOf, requireFreeName } from './service-functions-support';

interface StoredCaller {
  readonly id: string;
  readonly layout: Layout;
  readonly revision: number;
}

export interface Extraction {
  readonly request: AutomationFunctionExtractRequest;
  readonly row: StoredCaller;
  readonly functionId: string;
  readonly callee: FunctionV4;
  readonly caller: AutomationV4;
  readonly instanceKey: string;
}

export interface ReadyExtraction {
  readonly kind: 'ready';
  readonly found: Extraction;
  readonly calleePlan: JsonValue;
  readonly callerPlan: JsonValue;
  readonly problems: readonly AutomationProgramProblem[];
  readonly prior: SpeechPrincipal | null;
}

export type PreparedExtraction =
  { readonly kind: 'done'; readonly reply: AutomationFunctionExtractReply } | ReadyExtraction;

export interface PrepareExtractInput {
  readonly data: ProgramData;
  readonly caller: Caller;
  readonly authority: ConversationAuthority | undefined;
  readonly request: AutomationFunctionExtractRequest;
}

export interface CommitExtractInput {
  readonly kinds: readonly NodeKind[];
  readonly caller: Caller;
  readonly authority: ConversationAuthority | undefined;
  readonly ready: ReadyExtraction;
  readonly speech: SpeechPlan;
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

function done(
  request: AutomationFunctionExtractRequest,
  problems: readonly AutomationProgramProblem[],
  suggestion: readonly string[],
): PreparedExtraction {
  return { kind: 'done', reply: refusedExtract(request, problems, suggestion) };
}

function checkedCaller(
  env: AnalysisEnv,
  who: Caller,
  found: Extraction,
  callee: Built,
): PreparedExtraction {
  const pending = { id: found.functionId, definition: found.callee, plan: callee.plan };
  const withCallee: AnalysisEnv = { ...env, pending };
  const analysis = analyse(withCallee, found.caller);
  if (analysis.built === undefined) return done(found.request, analysis.problems, []);
  authorise(withCallee, who, found.caller, analysis.built);
  return {
    kind: 'ready',
    found,
    calleePlan: planValue(callee.plan),
    callerPlan: planValue(analysis.built.plan),
    problems: analysis.problems.filter((problem) => problem.severity !== 'error'),
    prior: priorSpeech(env.store, found.row.id),
  };
}

function checked(env: AnalysisEnv, who: Caller, found: Extraction): PreparedExtraction {
  const analysis = analyse(env, found.callee);
  if (analysis.built === undefined) return done(found.request, analysis.problems, []);
  authorise(env, who, found.callee, analysis.built);
  return checkedCaller(env, who, found, analysis.built);
}

function extracted(
  env: AnalysisEnv,
  request: AutomationFunctionExtractRequest,
): Extraction | PreparedExtraction {
  requireFreeName(env, request.name);
  const row = env.store.automations.byId(request.automationId);
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
  if (!result.ok) return done(request, [failure(result.code, result.reason)], result.suggestion);
  const callee = FUNCTION_V4.parse(unstructure(result.callee, env.kinds));
  return {
    request,
    row: { id: row.id, layout: row.layout, revision: row.revision },
    functionId,
    callee: {
      ...callee,
      inputs: edited(callee.inputs, request.inputs, 'input'),
      outputs: edited(callee.outputs, request.outputs, 'output'),
    },
    caller: AUTOMATION_V4.parse(unstructure(result.caller, env.kinds)),
    instanceKey: result.instanceKey,
  };
}

function prepare(store: Store, input: PrepareExtractInput): PreparedExtraction {
  const env = analysisEnv(store, input.data, null);
  const found = extracted(env, input.request);
  if ('kind' in found) return found;
  return checked(env, input.caller, found);
}

function commit(store: Store, input: CommitExtractInput): AutomationFunctionExtractReply {
  const { found, calleePlan, callerPlan, problems } = input.ready;
  const kinds = unitKinds(store, input.kinds);
  const author = authorOf(input.caller);
  const created = store.automationFunctions.create(
    {
      id: found.functionId,
      name: found.request.name,
      program: found.callee,
      layout: EMPTY_LAYOUT,
      interfaceHash: hashOf(found.callee),
      compat: 'compatible',
      planHash: store.automationPlans.put('function', calleePlan),
      author,
      createdBy: profileIdOf(input.caller),
    },
    kinds,
  );
  const saved = store.automations.replace(
    found.row.id,
    {
      program: found.caller,
      layout: found.row.layout,
      expectedRevision: found.row.revision,
      planHash: store.automationPlans.put('automation', callerPlan),
      author,
    },
    kinds,
  );
  store.harnessRecovery.effects.keep('automation', saved.id, input.authority);
  applySpeech(store, saved, input.speech);
  return {
    ok: true,
    summary: `Made ${created.name} and saved revision ${String(saved.revision)} of ${saved.name}.`,
    id: created.id,
    revision: created.latest_revision,
    compat: 'compatible',
    changes: [],
    affected: [],
    problems: [...problems],
    automationId: saved.id,
    callerRevision: saved.revision,
    instanceKey: found.instanceKey,
    suggestion: [],
  };
}

export const PREPARE_FUNCTION_EXTRACT_UNIT = storeUnit(
  (store, input: PrepareExtractInput): Reached<PreparedExtraction> =>
    withExecutionAuthority(input.authority, () => reached(() => prepare(store, input))),
);

export const COMMIT_FUNCTION_EXTRACT_UNIT = storeUnit(commit);
