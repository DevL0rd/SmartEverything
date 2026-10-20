import type { AutomationRunSummary } from '@smarteverything/domain';
import type { AutomationProgramsRepository } from '../../store/repositories/automation-programs';
import type { AutomationRunRecordsRepository } from '../../store/repositories/automation-run-records';

export function listRuns(
  records: Pick<AutomationRunRecordsRepository, 'summaries' | 'summariesOf'>,
  programs: Pick<AutomationProgramsRepository, 'list'>,
  query: { readonly automationId?: string | undefined; readonly limit: number },
  scope: { readonly owner: boolean; readonly sees: (automationId: string) => boolean },
): AutomationRunSummary[] {
  if (query.automationId !== undefined || scope.owner) {
    return records.summaries(query.automationId ?? null, query.limit);
  }
  const mine = programs
    .list()
    .filter((program) => scope.sees(program.id))
    .map((program) => program.id);
  return records.summariesOf(mine, query.limit);
}
