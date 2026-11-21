import {
  ApiError,
  type AutomationProgramComparison,
  type AutomationProgramDraftView,
  type AutomationProgramReply,
  type AutomationProgramRevisionSummary,
  type AutomationRevisionRow,
} from '@smarteverything/domain';
import { pluginKindsOf, programData } from './program-data';
import type { DraftInput } from './program-history-units';
import { reply } from './service-programs-analysis';
import type { ProgramEnv } from './service-programs';

export async function draftView(env: ProgramEnv, id: string): Promise<AutomationProgramDraftView> {
  const row = await env.store.host.call('automations', 'byId', id);
  return {
    id,
    name: row.name,
    revision: row.revision,
    drafted: row.draft !== null,
    program: row.draft === null ? row.definition : row.draft.program,
    layout: row.draft === null ? row.layout : row.draft.layout,
  };
}

export function saveDraft(
  env: ProgramEnv,
  id: string,
  draft: DraftInput,
): Promise<AutomationProgramReply> {
  return env.store.host.write('saveAutomationDraft', {
    data: programData(env.kinds, env.secrets),
    id,
    draft,
  });
}

export async function discardDraft(
  env: ProgramEnv,
  id: string,
  expectedRevision: number,
): Promise<AutomationProgramReply> {
  const row = await env.store.host.call('automations', 'discardDraft', id, expectedRevision);
  return reply(true, 'Draft discarded.', { id, revision: row.revision }, []);
}

export function revisions(
  env: ProgramEnv,
  id: string,
): Promise<AutomationProgramRevisionSummary[]> {
  return env.store.host.read('automationProgramRevisions', id);
}

export function revision(
  env: ProgramEnv,
  id: string,
  number: number,
): Promise<AutomationRevisionRow> {
  return env.store.host.call('automationRevisions', 'byRevision', id, number);
}

export function compare(
  env: ProgramEnv,
  id: string,
  from: number,
  to: number | 'draft',
): Promise<AutomationProgramComparison> {
  return env.store.host.read('compareAutomationProgram', {
    kinds: pluginKindsOf(env.kinds),
    id,
    from,
    to,
  });
}

export async function setEnabled(
  env: ProgramEnv,
  id: string,
  enabled: boolean,
): Promise<AutomationProgramReply> {
  const row = await env.store.host.call('automations', 'setEnabled', id, enabled);
  await env.engine.settled();
  const summary = `${row.name} is ${enabled ? 'on' : 'off'}.`;
  return reply(true, summary, { id: row.id, revision: row.revision }, []);
}

export async function rename(
  env: ProgramEnv,
  id: string,
  name: string,
): Promise<AutomationProgramReply> {
  const renamed = await env.store.host.write('renameAutomationProgram', { id, name });
  await env.engine.settled();
  return renamed;
}

export async function remove(env: ProgramEnv, id: string): Promise<void> {
  const user = await env.store.host.read('automationProgramUser', {
    data: programData(env.kinds, env.secrets),
    id,
  });
  if (user !== null) {
    throw new ApiError(
      'conflict',
      `The automation ${user} runs this automation. Remove that step first.`,
    );
  }
  await env.engine.retire(id);
  await env.store.host.write('removeAutomationProgram', id);
}
