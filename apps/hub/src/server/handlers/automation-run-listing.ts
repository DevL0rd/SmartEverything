import type { AutomationRunSummary, StoredAutomationRow } from '@smarteverything/domain';
import type { HostedRepository } from '../../store/host/hosted';

export async function listRuns(
  records: HostedRepository<'automationRunRecords', 'summaries' | 'summariesOf'>,
  programs: HostedRepository<'automations', 'list'>,
  query: { readonly automationId?: string | undefined; readonly limit: number },
  scope: { readonly owner: boolean; readonly sees: (program: StoredAutomationRow) => boolean },
): Promise<AutomationRunSummary[]> {
  if (query.automationId !== undefined || scope.owner) {
    return records.summaries(query.automationId ?? null, query.limit);
  }
  const mine = (await programs.list())
    .filter((program) => scope.sees(program))
    .map((program) => program.id);
  return records.summariesOf(mine, query.limit);
}
