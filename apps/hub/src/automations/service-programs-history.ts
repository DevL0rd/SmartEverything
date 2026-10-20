import {
  ApiError,
  type AutomationProgramComparison,
  type AutomationProgramDraftView,
  type AutomationProgramReply,
  type AutomationProgramRevisionSummary,
  type AutomationRevisionRow,
  type AutomationRowV3,
  type AutomationV3,
  type Layout,
} from '@smarteverything/domain';
import { lintProblems, reply, tally, type ProgramEnv } from './service-programs-analysis';
import { comparePrograms } from './service-programs-compare';

export interface DraftInput {
  readonly program: AutomationV3;
  readonly layout: Layout;
  readonly expectedRevision: number;
}

export function draftView(env: ProgramEnv, id: string): AutomationProgramDraftView {
  const row = env.programs.byId(id);
  return {
    id,
    name: row.name,
    revision: row.revision,
    drafted: row.draft !== null,
    program: row.draft?.program ?? row.definition,
    layout: row.draft?.layout ?? row.layout,
  };
}

export function saveDraft(env: ProgramEnv, id: string, input: DraftInput): AutomationProgramReply {
  const row = env.programs.saveDraft(
    id,
    { program: input.program, layout: input.layout },
    input.expectedRevision,
  );
  const problems = lintProblems(env, input.program);
  return reply(true, `Draft saved. ${tally(problems)}.`, { id, revision: row.revision }, problems);
}

export function discardDraft(
  env: ProgramEnv,
  id: string,
  expectedRevision: number,
): AutomationProgramReply {
  const row = env.programs.discardDraft(id, expectedRevision);
  return reply(true, 'Draft discarded.', { id, revision: row.revision }, []);
}

export function revisions(env: ProgramEnv, id: string): AutomationProgramRevisionSummary[] {
  env.programs.byId(id);
  return env.revisions.list(id).map(({ revision, saved_at, author, plan_hash }) => ({
    revision,
    saved_at,
    author,
    plan_hash,
  }));
}

export function revision(env: ProgramEnv, id: string, number: number): AutomationRevisionRow {
  return env.revisions.byRevision(id, number);
}

function draftOf(row: AutomationRowV3): AutomationV3 {
  if (row.draft === null) throw new ApiError('conflict', 'The automation has no draft to compare.');
  return row.draft.program;
}

export function compare(
  env: ProgramEnv,
  id: string,
  from: number,
  to: number | 'draft',
): AutomationProgramComparison {
  const earlier = env.revisions.byRevision(id, from).definition;
  const later =
    to === 'draft' ? draftOf(env.programs.byId(id)) : env.revisions.byRevision(id, to).definition;
  return { from, to, changes: [...comparePrograms(earlier, later)] };
}
