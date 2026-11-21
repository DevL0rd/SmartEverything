import {
  ApiError,
  programReferences,
  type AutomationProgramComparison,
  type AutomationProgramReply,
  type AutomationProgramRevisionSummary,
  type AutomationV3,
  type AutomationV4,
  type Layout,
  type ReferenceContext,
  type StoredAutomationRow,
} from '@smarteverything/domain';
import { storeUnit } from '../store/host/unit';
import { flatAutomation, flatFunction } from '../store/repositories/automation-trees';
import type { HostStore } from '../store/host/host-store';
import { requireFreeName } from './free-name';
import { usedKindsOf } from './plugin-kinds/ledger';
import type { ProgramData } from './program-data';
import { unitKinds } from './program-kinds';
import { comparePrograms } from './service-programs-compare';
import {
  analysisEnv,
  calleeDefinition,
  lintProblems,
  reply,
  tally,
  type AnalysisEnv,
} from './service-programs-analysis';

export interface DraftInput {
  readonly program: AutomationV4;
  readonly layout: Layout;
  readonly expectedRevision: number;
}

export interface SaveDraftInput {
  readonly data: ProgramData;
  readonly id: string;
  readonly draft: DraftInput;
}

export interface CompareInput {
  readonly kinds: ProgramData['kinds'];
  readonly id: string;
  readonly from: number;
  readonly to: number | 'draft';
}

function programsOf(row: StoredAutomationRow): readonly AutomationV3[] {
  return [row.definition, ...(row.draft === null ? [] : [row.draft.program])].map(flatAutomation);
}

function usedBy(env: AnalysisEnv, target: StoredAutomationRow): StoredAutomationRow | undefined {
  const context: ReferenceContext = {
    kinds: (id) => env.kinds.get(id),
    functions: (id, pin) => {
      const definition = calleeDefinition(env, id, pin);
      return definition === undefined ? undefined : flatFunction(definition);
    },
  };
  return env.store.automations
    .list()
    .find(
      (row) =>
        row.id !== target.id &&
        programsOf(row).some((program) => programReferences(program, target.id, context)),
    );
}

function userOf(
  store: HostStore,
  input: { readonly data: ProgramData; readonly id: string },
): string | null {
  const env = analysisEnv(store, input.data, null);
  const user = usedBy(env, store.automations.byId(input.id));
  return user === undefined ? null : user.name;
}

function remove(store: HostStore, id: string): void {
  store.automationRunRecords.forget(id);
  store.automations.remove(id);
  store.pluginKinds.prune(usedKindsOf(store));
}

function rename(
  store: HostStore,
  input: { readonly id: string; readonly name: string },
): AutomationProgramReply {
  requireFreeName(store.automations, input.name, input.id);
  const row = store.automations.rename(input.id, input.name);
  return reply(true, `Renamed to ${row.name}.`, { id: row.id, revision: row.revision }, []);
}

function saveDraft(store: HostStore, input: SaveDraftInput): AutomationProgramReply {
  const env = analysisEnv(store, input.data, null);
  const { id, draft } = input;
  const row = store.automations.saveDraft(
    id,
    { program: draft.program, layout: draft.layout },
    draft.expectedRevision,
    env.kinds,
  );
  const problems = lintProblems(env, draft.program);
  return reply(true, `Draft saved. ${tally(problems)}.`, { id, revision: row.revision }, problems);
}

function revisions(store: HostStore, id: string): AutomationProgramRevisionSummary[] {
  store.automations.byId(id);
  return store.automationRevisions.list(id).map(({ revision, saved_at, author, plan_hash }) => ({
    revision,
    saved_at,
    author,
    plan_hash,
  }));
}

function draftOf(row: StoredAutomationRow): AutomationV4 {
  if (row.draft === null) throw new ApiError('conflict', 'The automation has no draft to compare.');
  return row.draft.program;
}

function compare(store: HostStore, input: CompareInput): AutomationProgramComparison {
  const { id, from, to } = input;
  const earlier = store.automationRevisions.byRevision(id, from).definition;
  const later =
    to === 'draft'
      ? draftOf(store.automations.byId(id))
      : store.automationRevisions.byRevision(id, to).definition;
  const kinds = unitKinds(store, input.kinds);
  return { from, to, changes: [...comparePrograms(earlier, later, kinds)] };
}

export const AUTOMATION_PROGRAM_USER_UNIT = storeUnit(userOf);

export const REMOVE_AUTOMATION_PROGRAM_UNIT = storeUnit(remove);

export const RENAME_AUTOMATION_PROGRAM_UNIT = storeUnit(rename);

export const SAVE_AUTOMATION_DRAFT_UNIT = storeUnit(saveDraft);

export const AUTOMATION_PROGRAM_REVISIONS_UNIT = storeUnit(revisions);

export const COMPARE_AUTOMATION_PROGRAM_UNIT = storeUnit(compare);
