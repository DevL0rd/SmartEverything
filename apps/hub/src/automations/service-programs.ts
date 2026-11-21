import {
  ApiError,
  type AutomationProgramCheckRequest,
  type AutomationProgramComparison,
  type AutomationProgramDraftView,
  type AutomationProgramPatchReply,
  type AutomationProgramReply,
  type AutomationProgramRevisionSummary,
  type AutomationRevisionRow,
  type AutomationV4,
  type Layout,
  type NodeKindLookup,
} from '@smarteverything/domain';
import type { ToolHub } from '../ai-tools/tool-hub';
import { currentExecutionAuthority } from '../assistant/turn-authority';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import type { EngineV3 } from './engine-v3';
import type { KindCatalog } from './plugin-kinds/catalog';
import { pluginKindsOf, programData } from './program-data';
import { originOf } from './program-origin';
import { admitReach, reachRefusal } from './reach-admission';
import type { DraftInput } from './program-history-units';
import type { ProgramChange, ReadyProgram } from './program-units';
import type { AutomationSecrets } from './secrets-v3';
import { checked, failure, reply, tally } from './service-programs-analysis';
import {
  compare,
  discardDraft,
  draftView,
  remove,
  rename,
  revision,
  revisions,
  saveDraft,
  setEnabled,
} from './service-programs-history';
import { speechPlan } from './service-programs-speech';

export interface ProgramEnv {
  readonly store: Store;
  readonly secrets: Pick<AutomationSecrets, 'list'>;
  readonly kinds: NodeKindLookup & Pick<KindCatalog, 'kinds'>;
  readonly tools: Pick<ToolHub, 'pluginTurnRefusal'>;
  readonly engine: Pick<EngineV3, 'retire' | 'functionsChanged' | 'settled'>;
}

interface CreateInput {
  readonly id?: string | undefined;
  readonly name: string;
  readonly enabled: boolean;
  readonly definition: AutomationV4;
  readonly layout?: Layout | undefined;
}

interface UpdateInput {
  readonly definition: AutomationV4;
  readonly layout?: Layout | undefined;
  readonly expectedRevision: number;
}

interface PatchInput {
  readonly expectedRevision: number;
  readonly ops: readonly unknown[];
}

export interface AutomationPrograms {
  readonly create: (caller: Caller, input: CreateInput) => Promise<AutomationProgramReply>;
  readonly update: (
    caller: Caller,
    id: string,
    input: UpdateInput,
  ) => Promise<AutomationProgramReply>;
  readonly patch: (
    caller: Caller,
    id: string,
    input: PatchInput,
  ) => Promise<AutomationProgramPatchReply>;
  readonly check: (
    caller: Caller,
    request: AutomationProgramCheckRequest,
  ) => Promise<AutomationProgramReply>;
  readonly setEnabled: (id: string, enabled: boolean) => Promise<AutomationProgramReply>;
  readonly rename: (id: string, name: string) => Promise<AutomationProgramReply>;
  readonly remove: (id: string) => Promise<void>;
  readonly draft: (id: string) => Promise<AutomationProgramDraftView>;
  readonly saveDraft: (id: string, input: DraftInput) => Promise<AutomationProgramReply>;
  readonly discardDraft: (id: string, expectedRevision: number) => Promise<AutomationProgramReply>;
  readonly publish: (
    caller: Caller,
    id: string,
    expectedRevision: number,
  ) => Promise<AutomationProgramReply>;
  readonly revisions: (id: string) => Promise<AutomationProgramRevisionSummary[]>;
  readonly revision: (id: string, number: number) => Promise<AutomationRevisionRow>;
  readonly compare: (
    id: string,
    from: number,
    to: number | 'draft',
  ) => Promise<AutomationProgramComparison>;
}

async function commit(
  env: ProgramEnv,
  caller: Caller,
  ready: ReadyProgram,
): Promise<AutomationProgramReply> {
  const origin = originOf(env.tools, caller, ready.program);
  const speech = speechPlan(env.store, caller, ready.program, ready.prior);
  const saved = await env.store.host.write('commitAutomationProgram', {
    kinds: pluginKindsOf(env.kinds),
    caller,
    authority: currentExecutionAuthority(),
    program: ready.program,
    save: ready.save,
    plan: ready.plan,
    origin,
    speech,
  });
  await env.engine.settled();
  const summary = `Saved revision ${String(saved.revision)}. ${tally(ready.problems)}.`;
  return reply(true, summary, saved, ready.problems);
}

async function change(
  env: ProgramEnv,
  caller: Caller,
  wanted: ProgramChange,
): Promise<AutomationProgramPatchReply> {
  const read = await env.store.host.read('prepareAutomationProgram', {
    data: programData(env.kinds, env.secrets),
    caller,
    authority: currentExecutionAuthority(),
    change: wanted,
  });
  const prepared = admitReach(env.store, caller, read);
  if (prepared.kind === 'done') return { ...prepared.reply, created: [], detached: [] };
  const committed = await commit(env, caller, prepared);
  const edits = prepared.edits;
  if (edits === null) return { ...committed, created: [], detached: [] };
  return { ...committed, created: [...edits.created], detached: [...edits.detached] };
}

async function changed(
  env: ProgramEnv,
  caller: Caller,
  wanted: ProgramChange,
): Promise<AutomationProgramReply> {
  const { created: _created, detached: _detached, ...result } = await change(env, caller, wanted);
  return result;
}

function refusedProblem(cause: ApiError): ReturnType<typeof failure> {
  return failure(cause.code, cause.message);
}

function originProblems(
  env: ProgramEnv,
  caller: Caller,
  program: AutomationV4 | null,
): ReturnType<typeof failure>[] {
  if (program === null) return [];
  try {
    originOf(env.tools, caller, program);
    return [];
  } catch (cause) {
    if (cause instanceof ApiError) return [refusedProblem(cause)];
    throw cause;
  }
}

async function check(
  env: ProgramEnv,
  caller: Caller,
  request: AutomationProgramCheckRequest,
): Promise<AutomationProgramReply> {
  const result = await env.store.host.read('checkAutomationProgram', {
    data: programData(env.kinds, env.secrets),
    caller,
    authority: currentExecutionAuthority(),
    request,
  });
  const reach =
    result.reach === null ? [] : [refusedProblem(reachRefusal(env.store, caller, result.reach))];
  const origin = originProblems(env, caller, result.origin);
  return checked(result.basis, [...result.problems, ...reach, ...origin]);
}

export function automationPrograms(env: ProgramEnv): AutomationPrograms {
  return {
    create: (caller, input) =>
      changed(env, caller, {
        kind: 'create',
        id: input.id,
        name: input.name,
        enabled: input.enabled,
        definition: input.definition,
        layout: input.layout,
      }),
    update: (caller, id, input) =>
      changed(env, caller, {
        kind: 'update',
        id,
        definition: input.definition,
        layout: input.layout,
        expectedRevision: input.expectedRevision,
      }),
    patch: (caller, id, input) =>
      change(env, caller, {
        kind: 'patch',
        id,
        ops: input.ops,
        expectedRevision: input.expectedRevision,
      }),
    check: (caller, request) => check(env, caller, request),
    setEnabled: (id, enabled) => setEnabled(env, id, enabled),
    rename: (id, name) => rename(env, id, name),
    remove: (id) => remove(env, id),
    draft: (id) => draftView(env, id),
    saveDraft: (id, input) => saveDraft(env, id, input),
    discardDraft: (id, expectedRevision) => discardDraft(env, id, expectedRevision),
    publish: (caller, id, expectedRevision) =>
      changed(env, caller, { kind: 'publish', id, expectedRevision }),
    revisions: (id) => revisions(env, id),
    revision: (id, number) => revision(env, id, number),
    compare: (id, from, to) => compare(env, id, from, to),
  };
}
