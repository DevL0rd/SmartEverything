import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AUTOMATION_V4,
  EMPTY_LAYOUT,
  type AutomationProgramCheckRequest,
  type AutomationProgramProblem,
  type AutomationProgramPatchReply,
  type AutomationProgramReply,
  type AutomationV4,
  type JsonValue,
  type Layout,
  type NodeKind,
  type PluginOrigin,
  type ProgramV4,
  type StoredAutomationRow,
} from '@smarteverything/domain';
import { withExecutionAuthority } from '../assistant/turn-authority';
import type { ConversationAuthority } from '../harness/authority-contract';
import type { Caller } from '../server/auth';
import type { Refusal } from '../server/person-access';
import { storeUnit } from '../store/host/unit';
import { flatAutomation } from '../store/repositories/automation-trees';
import type { HostStore } from '../store/host/host-store';
import type { SpeechPrincipal } from '../transcripts/speech-principal';
import { freeName } from './free-name';
import { pruneKeptData } from './kept-data-prune';
import { usedKindsOf } from './plugin-kinds/ledger';
import { alreadyMade } from './program-client-id';
import type { ProgramData } from './program-data';
import { unitKinds } from './program-kinds';
import { applySpeech, priorSpeech, type SpeechPlan } from './program-speech';
import {
  analyse,
  analysisEnv,
  failure,
  patched,
  planValue,
  refusalText,
  refusedPatch,
  reply,
  tally,
  type AnalysisEnv,
  type Basis,
  type Built,
} from './service-programs-analysis';
import {
  authorOf,
  reached,
  ReachRefusedError,
  requireKnownSignals,
  requireOwnerForManifest,
  requireOwnerForTriggers,
  requireReachableTargets,
  requireVisibleComputers,
  type Reached,
} from './service-reach';

const DEFAULT_MAX = 10;

export type ProgramChange =
  | {
      readonly kind: 'create';
      readonly id: string | undefined;
      readonly name: string;
      readonly enabled: boolean;
      readonly definition: AutomationV4;
      readonly layout: Layout | undefined;
    }
  | {
      readonly kind: 'update';
      readonly id: string;
      readonly definition: AutomationV4;
      readonly layout: Layout | undefined;
      readonly expectedRevision: number;
    }
  | {
      readonly kind: 'patch';
      readonly id: string;
      readonly ops: readonly unknown[];
      readonly expectedRevision: number;
    }
  | { readonly kind: 'publish'; readonly id: string; readonly expectedRevision: number };

export type ProgramSave =
  | {
      readonly kind: 'create';
      readonly id: string | undefined;
      readonly name: string;
      readonly enabled: boolean;
      readonly layout: Layout;
    }
  | {
      readonly kind: 'replace';
      readonly id: string;
      readonly layout: Layout;
      readonly expectedRevision: number;
    }
  | { readonly kind: 'publish'; readonly id: string; readonly expectedRevision: number };

export interface PatchEdits {
  readonly created: readonly { readonly key: string; readonly id: string }[];
  readonly detached: AutomationProgramPatchReply['detached'];
}

export interface ReadyProgram {
  readonly kind: 'ready';
  readonly program: AutomationV4;
  readonly basis: Basis | null;
  readonly save: ProgramSave;
  readonly plan: JsonValue;
  readonly problems: readonly AutomationProgramProblem[];
  readonly prior: SpeechPrincipal | null;
  readonly edits: PatchEdits | null;
}

export type PreparedProgram =
  { readonly kind: 'done'; readonly reply: AutomationProgramReply } | ReadyProgram;

interface Turn {
  readonly data: ProgramData;
  readonly caller: Caller;
  readonly authority: ConversationAuthority | undefined;
}

export interface PrepareProgramInput extends Turn {
  readonly change: ProgramChange;
}

export interface CheckProgramInput extends Turn {
  readonly request: AutomationProgramCheckRequest;
}

export interface CheckedProgram {
  readonly basis: Basis | null;
  readonly problems: readonly AutomationProgramProblem[];
  readonly reach: Refusal | null;
  readonly origin: AutomationV4 | null;
}

export interface CommitProgramInput {
  readonly kinds: readonly NodeKind[];
  readonly caller: Caller;
  readonly authority: ConversationAuthority | undefined;
  readonly program: AutomationV4;
  readonly save: ProgramSave;
  readonly plan: JsonValue;
  readonly origin: PluginOrigin | null;
  readonly speech: SpeechPlan;
}

interface Changed {
  readonly program: AutomationV4;
  readonly basis: Basis | null;
  readonly save: ProgramSave;
  readonly edits: PatchEdits | null;
}

function stale(): ApiError {
  return new ApiError(
    'conflict',
    'The automation changed since it was read. Reload it and save again.',
  );
}

function expectRevision(row: StoredAutomationRow, expected: number): void {
  if (row.revision !== expected) throw stale();
}

function withNewDefaults(program: AutomationV4): AutomationV4 {
  const { policy } = program;
  const wide = policy.mode === 'queue' || policy.mode === 'parallel';
  return {
    ...program,
    policy: wide && policy.max === undefined ? { ...policy, max: DEFAULT_MAX } : policy,
    budgets: { startBucket: 'on', feedback: 'on', effects: 'on', ...program.budgets },
  };
}

export function authoriseProgram(
  env: AnalysisEnv,
  caller: Caller,
  program: AutomationV4,
  built: Built,
): void {
  const { store } = env;
  requireKnownSignals(store, program);
  requireOwnerForTriggers(caller, program, env.kinds);
  requireOwnerForManifest(caller, built.manifest);
  requireVisibleComputers(store, caller, built.manifest);
  requireReachableTargets(store, caller, built.manifest);
}

function stored(env: AnalysisEnv, id: string, expected: number): StoredAutomationRow {
  const row = env.store.automations.byId(id);
  expectRevision(row, expected);
  return row;
}

function created(change: Extract<ProgramChange, { kind: 'create' }>): Changed {
  return {
    program: withNewDefaults(change.definition),
    basis: null,
    save: {
      kind: 'create',
      id: change.id,
      name: change.name,
      enabled: change.enabled,
      layout: change.layout ?? EMPTY_LAYOUT,
    },
    edits: null,
  };
}

function replaced(row: StoredAutomationRow, program: AutomationV4, layout: Layout): Changed {
  return {
    program,
    basis: { id: row.id, revision: row.revision },
    save: { kind: 'replace', id: row.id, layout, expectedRevision: row.revision },
    edits: null,
  };
}

function patchedChange(
  env: AnalysisEnv,
  change: Extract<ProgramChange, { kind: 'patch' }>,
): Changed | AutomationProgramReply {
  const row = stored(env, change.id, change.expectedRevision);
  const result = patched(row.definition, change.ops, { kinds: env.kinds, newId: randomUUID });
  if (!result.ok) {
    const problems = refusedPatch(result);
    const summary = `Refused: ${refusalText(problems)}. Nothing was changed.`;
    return reply(false, summary, { id: row.id, revision: row.revision }, problems);
  }
  const edits: PatchEdits = {
    created: result.created.map(({ key, id }) => ({ key, id })),
    detached: result.detached.map(({ owner, where, port, reads }) => ({
      owner,
      where,
      port,
      reads,
    })),
  };
  return { ...replaced(row, AUTOMATION_V4.parse(result.program), row.layout), edits };
}

function published(env: AnalysisEnv, id: string, expected: number): Changed {
  const row = stored(env, id, expected);
  if (row.draft === null) throw new ApiError('conflict', 'The automation has no draft to publish.');
  return {
    program: row.draft.program,
    basis: { id, revision: row.revision },
    save: { kind: 'publish', id, expectedRevision: expected },
    edits: null,
  };
}

function changeOf(
  env: AnalysisEnv,
  caller: Caller,
  change: ProgramChange,
): Changed | AutomationProgramReply {
  if (change.kind === 'create') {
    return alreadyMade(env.store.automations, caller, change.id) ?? created(change);
  }
  if (change.kind === 'patch') return patchedChange(env, change);
  if (change.kind === 'publish') return published(env, change.id, change.expectedRevision);
  const row = stored(env, change.id, change.expectedRevision);
  return replaced(row, change.definition, change.layout ?? row.layout);
}

function prepared(env: AnalysisEnv, caller: Caller, change: Changed): PreparedProgram {
  const analysis = analyse(env, change.program);
  const { built } = analysis;
  if (built === undefined) {
    const summary = `Refused: ${tally(analysis.problems)}. Nothing was saved.`;
    return { kind: 'done', reply: reply(false, summary, change.basis, analysis.problems) };
  }
  authoriseProgram(env, caller, change.program, built);
  return {
    kind: 'ready',
    ...change,
    plan: planValue(built.plan),
    problems: analysis.problems,
    prior: priorSpeech(env.store, change.save.id),
  };
}

function prepare(store: HostStore, input: PrepareProgramInput): PreparedProgram {
  const env = analysisEnv(store, input.data, null);
  const change = changeOf(env, input.caller, input.change);
  if ('ok' in change) return { kind: 'done', reply: change };
  return prepared(env, input.caller, change);
}

interface Authority {
  readonly problems: readonly AutomationProgramProblem[];
  readonly reach: Refusal | null;
}

function authorityOf(
  env: AnalysisEnv,
  caller: Caller,
  program: AutomationV4,
  built: Built,
): Authority {
  try {
    authoriseProgram(env, caller, program, built);
    return { problems: [], reach: null };
  } catch (cause) {
    if (cause instanceof ReachRefusedError) return { problems: [], reach: cause.why };
    if (cause instanceof ApiError)
      return { problems: [failure(cause.code, cause.message)], reach: null };
    throw cause;
  }
}

function checkProgram(
  env: AnalysisEnv,
  caller: Caller,
  program: ProgramV4,
  basis: Basis | null,
): CheckedProgram {
  const analysis = analyse(env, program);
  const { built } = analysis;
  if (built === undefined || program.kind !== 'automation') {
    return { basis, problems: analysis.problems, reach: null, origin: null };
  }
  const authority = authorityOf(env, caller, program, built);
  const passed = authority.problems.length === 0 && authority.reach === null;
  return {
    basis,
    problems: [...analysis.problems, ...authority.problems],
    reach: authority.reach,
    origin: passed ? program : null,
  };
}

function check(store: HostStore, input: CheckProgramInput): CheckedProgram {
  const env = analysisEnv(store, input.data, null);
  const { request } = input;
  if (!('ops' in request)) return checkProgram(env, input.caller, request.definition, null);
  const row = env.store.automations.byId(request.automationId);
  const result = patched(row.definition, request.ops, {
    allowProblems: true,
    kinds: env.kinds,
    newId: randomUUID,
  });
  const basis = { id: row.id, revision: row.revision };
  if (result.ok) return checkProgram(env, input.caller, result.program, basis);
  return { basis, problems: refusedPatch(result), reach: null, origin: null };
}

interface Stamp {
  readonly planHash: string;
  readonly origin: PluginOrigin | null;
  readonly author: ReturnType<typeof authorOf>;
}

function saveProgram(
  store: HostStore,
  input: CommitProgramInput,
  stamp: Stamp,
): StoredAutomationRow {
  const { save, program } = input;
  const kinds = unitKinds(store, input.kinds);
  const programs = store.automations;
  if (save.kind === 'create') {
    const { id, enabled, layout } = save;
    const name = freeName(programs, save.name);
    return programs.create({ id, name, enabled, program, layout, ...stamp }, kinds);
  }
  const { planHash, author } = stamp;
  const { expectedRevision } = save;
  if (save.kind === 'publish')
    return programs.publish(save.id, { expectedRevision, planHash, author });
  return programs.replace(
    save.id,
    { program, layout: save.layout, expectedRevision, planHash, author },
    kinds,
  );
}

function commit(store: HostStore, input: CommitProgramInput): Basis {
  const planHash = store.automationPlans.put('automation', input.plan);
  const author = authorOf(input.caller);
  const saved = saveProgram(store, input, { planHash, origin: input.origin, author });
  pruneKeptData(store, saved.id, flatAutomation(saved.definition));
  store.pluginKinds.prune(usedKindsOf(store));
  store.harnessRecovery.effects.keep('automation', saved.id, input.authority);
  applySpeech(store, saved, input.speech);
  return { id: saved.id, revision: saved.revision };
}

export const PREPARE_AUTOMATION_PROGRAM_UNIT = storeUnit(
  (store, input: PrepareProgramInput): Reached<PreparedProgram> =>
    withExecutionAuthority(input.authority, () => reached(() => prepare(store, input))),
);

export const CHECK_AUTOMATION_PROGRAM_UNIT = storeUnit(
  (store, input: CheckProgramInput): CheckedProgram =>
    withExecutionAuthority(input.authority, () => check(store, input)),
);

export const COMMIT_AUTOMATION_PROGRAM_UNIT = storeUnit(commit);
