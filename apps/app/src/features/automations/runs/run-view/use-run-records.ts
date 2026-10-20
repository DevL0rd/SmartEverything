import type { UseQueryResult } from '@tanstack/react-query';
import type { AutomationRunSummary, RunNodeRecord } from '@smarteverything/domain';
import { useScreenQuery } from '../../../../queries/use-screen-query';
import { automationKeys } from '../../data/keys';
import { useAutomationsSource, type AutomationsApi } from '../../data/source';

export interface RunRecords {
  readonly run: AutomationRunSummary;
  readonly nodes: readonly RunNodeRecord[];
}

async function readAll(api: AutomationsApi, runId: string): Promise<RunRecords> {
  const first = await api.readRun(runId);
  const nodes = [...first.nodes];
  let after = first.next;
  while (after !== null) {
    const page = await api.readRunNodes(runId, { after });
    nodes.push(...page.nodes);
    after = page.next;
  }
  return { run: first.run, nodes };
}

export function useRunRecords(runId: string): UseQueryResult<RunRecords> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: [...automationKeys.run(runId), 'records'],
    queryFn: () => readAll(api, runId),
  });
}
