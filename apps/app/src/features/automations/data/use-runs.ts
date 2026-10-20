import { useMemo } from 'react';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type {
  AutomationDecision,
  AutomationRunNodesPage,
  AutomationRunStartReply,
  AutomationRunSummary,
  AutomationRunView,
  AutomationTestsRunReply,
  StoredTest,
} from '@smarteverything/domain';
import { useScreenQuery } from '../../../queries/use-screen-query';
import type { RunNodesQuery, RunStartBody, TestBody } from './api';
import { automationKeys } from './keys';
import { useAutomationsSource } from './source';

export function useRuns(
  automationId: string | null,
  limit?: number,
): UseQueryResult<AutomationRunSummary[]> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.runs(automationId),
    queryFn: () => api.listRuns(automationId ?? undefined, limit),
  });
}

export function useRun(runId: string): UseQueryResult<AutomationRunView> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.run(runId),
    queryFn: () => api.readRun(runId),
  });
}

export function useRunNodes(
  runId: string,
  query: RunNodesQuery,
): UseQueryResult<AutomationRunNodesPage> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.nodes(
      runId,
      query.after ?? -1,
      query.nodeId ?? null,
      query.iteration ?? null,
    ),
    queryFn: () => api.readRunNodes(runId, query),
  });
}

export function useDecisions(automationId: string): UseQueryResult<AutomationDecision[]> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.decisions(automationId),
    queryFn: () => api.listDecisions(automationId),
  });
}

export function useStoredTests(automationId: string): UseQueryResult<StoredTest[]> {
  const { api } = useAutomationsSource();
  return useScreenQuery({
    queryKey: automationKeys.tests(automationId),
    queryFn: () => api.listTests(automationId),
  });
}

export interface RunActions {
  readonly start: (body: RunStartBody) => Promise<AutomationRunStartReply>;
  readonly stop: (runId: string) => Promise<AutomationRunSummary>;
  readonly stopAll: (automationId: string, key?: string) => Promise<number>;
  readonly createTest: (automationId: string, body: TestBody) => Promise<StoredTest>;
  readonly saveTest: (automationId: string, testId: string, body: TestBody) => Promise<StoredTest>;
  readonly removeTest: (automationId: string, testId: string) => Promise<void>;
  readonly runTests: (automationId: string) => Promise<AutomationTestsRunReply>;
}

export function useRunActions(): RunActions {
  const { api } = useAutomationsSource();
  const client = useQueryClient();
  return useMemo((): RunActions => {
    const runsChanged = (automationId: string | null): Promise<void> =>
      client.invalidateQueries({ queryKey: automationKeys.runs(automationId) });
    const testsChanged = (automationId: string): Promise<void> =>
      client.invalidateQueries({ queryKey: automationKeys.tests(automationId) });
    return {
      start: async (body): Promise<AutomationRunStartReply> => {
        const reply = await api.startRun(body);
        await Promise.all([runsChanged(body.automationId), runsChanged(null)]);
        return reply;
      },
      stop: async (runId): Promise<AutomationRunSummary> => {
        const run = await api.stopRun(runId);
        client.setQueryData(automationKeys.run(runId), (view: AutomationRunView | undefined) =>
          view === undefined ? view : { ...view, run },
        );
        await Promise.all([runsChanged(run.automation_id), runsChanged(null)]);
        return run;
      },
      stopAll: async (automationId, key): Promise<number> => {
        const stopped = await api.stopRuns(automationId, key);
        await Promise.all([runsChanged(automationId), runsChanged(null)]);
        return stopped;
      },
      createTest: async (automationId, body): Promise<StoredTest> => {
        const test = await api.createTest(automationId, body);
        await testsChanged(automationId);
        return test;
      },
      saveTest: async (automationId, testId, body): Promise<StoredTest> => {
        const test = await api.saveTest(automationId, testId, body);
        await testsChanged(automationId);
        return test;
      },
      removeTest: async (automationId, testId): Promise<void> => {
        await api.removeTest(automationId, testId);
        await testsChanged(automationId);
      },
      runTests: api.runTests,
    };
  }, [api, client]);
}
