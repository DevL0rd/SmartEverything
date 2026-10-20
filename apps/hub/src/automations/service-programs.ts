import {
  ApiError,
  AUTOMATION_V3,
  EMPTY_LAYOUT,
  programReferences,
  type AutomationAuthor,
  type AutomationProgramComparison,
  type AutomationProgramCheckRequest,
  type AutomationProgramDraftView,
  type AutomationProgramPatchReply,
  type AutomationProgramProblem,
  type AutomationProgramReply,
  type AutomationProgramRevisionSummary,
  type AutomationRevisionRow,
  type AutomationRowV3,
  type AutomationV3,
  type Layout,
  type PluginOrigin,
  type ReferenceContext,
} from '@smarteverything/domain';
import type { Program } from '@smarteverything/flow/program/walk';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import type { Caller } from '../server/auth';
import {
  analyse,
  checked,
  failure,
  kindOf,
  patched,
  planValue,
  refusedPatch,
  reply,
  revisionOf,
  tally,
  type Basis,
  type Built,
  type ProgramEnv,
} from './service-programs-analysis';
import {
  compare,
  discardDraft,
  draftView,
  revision,
  revisions,
  saveDraft,
  type DraftInput,
} from './service-programs-history';
import { authorSpeech } from './service-programs-speech';
import {
  authorOf,
  originOf,
  requireKnownSignals,
  requireOwnerForManifest,
  requireOwnerForTriggers,
  requireReachableTargets,
  requireVisibleComputers,
} from './service-reach';
import { pruneKeptData } from './kept-data-prune';

export type { ProgramEnv } from './service-programs-analysis';
const DEFAULT_MAX = 10;

interface Stamp {
  readonly planHash: string;
  readonly origin: PluginOrigin | null;
  readonly author: AutomationAuthor;
}

interface Change {
  readonly program: AutomationV3;
  readonly basis: Basis | null;
  readonly save: (stamp: Stamp) => AutomationRowV3;
}

interface CreateInput {
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationV3;
  readonly layout?: Layout | undefined;
}

interface UpdateInput {
  readonly definition: AutomationV3;
  readonly layout?: Layout | undefined;
  readonly expectedRevision: number;
}

interface PatchInput {
  readonly expectedRevision: number;
  readonly ops: readonly unknown[];
}

export interface AutomationPrograms {
  readonly create: (caller: Caller, input: CreateInput) => AutomationProgramReply;
  readonly update: (caller: Caller, id: string, input: UpdateInput) => AutomationProgramReply;
  readonly patch: (caller: Caller, id: string, input: PatchInput) => AutomationProgramPatchReply;
  readonly check: (
    caller: Caller,
    request: AutomationProgramCheckRequest,
  ) => AutomationProgramReply;
  readonly setEnabled: (id: string, enabled: boolean) => AutomationProgramReply;
  readonly remove: (id: string) => void;
  readonly draft: (id: string) => AutomationProgramDraftView;
  readonly saveDraft: (id: string, input: DraftInput) => AutomationProgramReply;
  readonly discardDraft: (id: string, expectedRevision: number) => AutomationProgramReply;
  readonly publish: (
    caller: Caller,
    id: string,
    expectedRevision: number,
  ) => AutomationProgramReply;
  readonly revisions: (id: string) => AutomationProgramRevisionSummary[];
  readonly revision: (id: string, number: number) => AutomationRevisionRow;
  readonly compare: (id: string, from: number, to: number | 'draft') => AutomationProgramComparison;
}

function stale(): ApiError {
  return new ApiError(
    'conflict',
    'The automation changed since it was read. Reload it and save again.',
  );
}

function expectRevision(row: AutomationRowV3, expected: number): void {
  if (row.revision !== expected) throw stale();
}

function withNewDefaults(program: AutomationV3): AutomationV3 {
  const { policy } = program;
  const wide = policy.mode === 'queue' || policy.mode === 'parallel';
  return {
    ...program,
    policy: wide && policy.max === undefined ? { ...policy, max: DEFAULT_MAX } : policy,
    budgets: { startBucket: 'on', feedback: 'on', effects: 'on', ...program.budgets },
  };
}

function authorise(
  env: ProgramEnv,
  caller: Caller,
  program: AutomationV3,
  built: Built,
): PluginOrigin | null {
  const { store } = env;
  requireKnownSignals(store, program);
  requireOwnerForTriggers(caller, program);
  requireOwnerForManifest(caller, built.manifest);
  requireVisibleComputers(store, caller, built.manifest);
  requireReachableTargets(store, caller, built.manifest);
  return originOf(env.tools, caller, program);
}

function authorityProblems(
  env: ProgramEnv,
  caller: Caller,
  program: Program,
  built: Built | undefined,
): readonly AutomationProgramProblem[] {
  if (built === undefined || program.kind !== 'automation') return [];
  try {
    authorise(env, caller, program, built);
    return [];
  } catch (cause) {
    if (cause instanceof ApiError) return [failure(cause.code, cause.message)];
    throw cause;
  }
}

function commit(env: ProgramEnv, caller: Caller, change: Change): AutomationProgramReply {
  const { program, basis } = change;
  const analysis = analyse(env, program);
  const { built } = analysis;
  if (built === undefined) {
    const summary = `Refused: ${tally(analysis.problems)}. Nothing was saved.`;
    return reply(false, summary, basis, analysis.problems);
  }
  const origin = authorise(env, caller, program, built);
  const row = env.store.write(() => {
    const planHash = env.plans.put('automation', planValue(built.plan));
    const saved = change.save({ planHash, origin, author: authorOf(env.store, caller) });
    pruneKeptData(env.store, saved.id, saved.definition);
    env.store.harnessRecovery.effects.keep('automation', saved.id, currentExecutionAuthority());
    authorSpeech(env.store, caller, saved);
    return saved;
  });
  const summary = `Saved revision ${String(row.revision)}. ${tally(analysis.problems)}.`;
  return reply(true, summary, { id: row.id, revision: row.revision }, analysis.problems);
}

function create(env: ProgramEnv, caller: Caller, input: CreateInput): AutomationProgramReply {
  const program = withNewDefaults(input.definition);
  return commit(env, caller, {
    program,
    basis: null,
    save: (stamp) =>
      env.programs.create({
        name: input.name,
        enabled: input.enabled,
        program,
        layout: input.layout ?? EMPTY_LAYOUT,
        planHash: stamp.planHash,
        origin: stamp.origin,
        author: stamp.author,
      }),
  });
}

function replacement(
  env: ProgramEnv,
  row: AutomationRowV3,
  next: { readonly program: AutomationV3; readonly layout: Layout; readonly expected: number },
): Change {
  return {
    program: next.program,
    basis: { id: row.id, revision: row.revision },
    save: (stamp) =>
      env.programs.replace(row.id, {
        program: next.program,
        layout: next.layout,
        expectedRevision: next.expected,
        planHash: stamp.planHash,
        author: stamp.author,
      }),
  };
}

function update(
  env: ProgramEnv,
  caller: Caller,
  id: string,
  input: UpdateInput,
): AutomationProgramReply {
  const row = env.programs.byId(id);
  expectRevision(row, input.expectedRevision);
  return commit(
    env,
    caller,
    replacement(env, row, {
      program: input.definition,
      layout: input.layout ?? row.layout,
      expected: input.expectedRevision,
    }),
  );
}

function patch(
  env: ProgramEnv,
  caller: Caller,
  id: string,
  input: PatchInput,
): AutomationProgramPatchReply {
  const row = env.programs.byId(id);
  expectRevision(row, input.expectedRevision);
  const result = patched(row.definition, input.ops);
  if (!result.ok) {
    const problem = refusedPatch(result);
    const summary = `Refused: ${problem.message}. Nothing was changed.`;
    const basis = { id, revision: row.revision };
    return { ...reply(false, summary, basis, [problem]), created: [], detached: [] };
  }
  const committed = commit(
    env,
    caller,
    replacement(env, row, {
      program: AUTOMATION_V3.parse(result.program),
      layout: row.layout,
      expected: input.expectedRevision,
    }),
  );
  if (!committed.ok) return { ...committed, created: [], detached: [] };
  return {
    ...committed,
    created: result.created.map(({ key, id: made }) => ({ key, id: made })),
    detached: result.detached.map(({ owner, where, port, reads }) => ({
      owner,
      where,
      ...(port === undefined ? {} : { port }),
      reads,
    })),
  };
}

function checkProgram(
  env: ProgramEnv,
  caller: Caller,
  program: Program,
  basis: Basis | null,
): AutomationProgramReply {
  const analysis = analyse(env, program);
  const authority = authorityProblems(env, caller, program, analysis.built);
  return checked(basis, [...analysis.problems, ...authority]);
}

function checkPatch(
  env: ProgramEnv,
  caller: Caller,
  request: Extract<AutomationProgramCheckRequest, { ops: unknown }>,
): AutomationProgramReply {
  const row = env.programs.byId(request.automationId);
  const result = patched(row.definition, request.ops);
  const basis = { id: row.id, revision: row.revision };
  return result.ok
    ? checkProgram(env, caller, result.program, basis)
    : checked(basis, [refusedPatch(result)]);
}

function check(
  env: ProgramEnv,
  caller: Caller,
  request: AutomationProgramCheckRequest,
): AutomationProgramReply {
  if ('ops' in request) return checkPatch(env, caller, request);
  return checkProgram(env, caller, request.definition, null);
}

function usedBy(env: ProgramEnv, target: AutomationRowV3): AutomationRowV3 | undefined {
  const context: ReferenceContext = {
    kinds: kindOf,
    functions: (id, pin) => revisionOf(env, id, pin)?.definition,
  };
  const programsOf = (row: AutomationRowV3): readonly AutomationV3[] =>
    row.draft === null ? [row.definition] : [row.definition, row.draft.program];
  return env.programs
    .list()
    .find(
      (row) =>
        row.id !== target.id &&
        programsOf(row).some((program) => programReferences(program, target.id, context)),
    );
}

function setEnabled(env: ProgramEnv, id: string, enabled: boolean): AutomationProgramReply {
  const row = env.store.write(() => env.programs.setEnabled(id, enabled));
  const summary = `${row.name} is ${enabled ? 'on' : 'off'}.`;
  return reply(true, summary, { id: row.id, revision: row.revision }, []);
}

function remove(env: ProgramEnv, id: string): void {
  env.store.write(() => {
    const row = env.programs.byId(id);
    const user = usedBy(env, row);
    if (user !== undefined) {
      throw new ApiError(
        'conflict',
        `The automation ${user.name} runs this automation. Remove that step first.`,
      );
    }
    env.store.automationRunRecords.forget(id);
    env.programs.remove(id);
  });
}

function publish(
  env: ProgramEnv,
  caller: Caller,
  id: string,
  expectedRevision: number,
): AutomationProgramReply {
  const row = env.programs.byId(id);
  expectRevision(row, expectedRevision);
  if (row.draft === null) throw new ApiError('conflict', 'The automation has no draft to publish.');
  return commit(env, caller, {
    program: row.draft.program,
    basis: { id, revision: row.revision },
    save: (stamp) =>
      env.programs.publish(id, {
        expectedRevision,
        planHash: stamp.planHash,
        author: stamp.author,
      }),
  });
}

export function automationPrograms(env: ProgramEnv): AutomationPrograms {
  return {
    create: (caller, input) => create(env, caller, input),
    update: (caller, id, input) => update(env, caller, id, input),
    patch: (caller, id, input) => patch(env, caller, id, input),
    check: (caller, request) => check(env, caller, request),
    setEnabled: (id, enabled) => setEnabled(env, id, enabled),
    remove: (id): void => {
      remove(env, id);
    },
    draft: (id) => draftView(env, id),
    saveDraft: (id, input) => saveDraft(env, id, input),
    discardDraft: (id, expectedRevision) => discardDraft(env, id, expectedRevision),
    publish: (caller, id, expectedRevision) => publish(env, caller, id, expectedRevision),
    revisions: (id) => revisions(env, id),
    revision: (id, number) => revision(env, id, number),
    compare: (id, from, to) => compare(env, id, from, to),
  };
}
