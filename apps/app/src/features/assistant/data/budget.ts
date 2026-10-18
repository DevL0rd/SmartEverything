import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useScreenQuery } from '../../../queries/use-screen-query';
import {
  AI_BUDGET_ENDPOINTS as B,
  type AiBudgetChange,
  type AiBudgetStatus,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { api } from '../../../api/transport';
import { AI_USAGE_PREFIX } from '../../../queries/keys';

const log = new Logger('app.ai-budget');

const BUDGET_KEY = [...AI_USAGE_PREFIX, 'budget'] as const;

export function useBudgetStatus(): UseQueryResult<AiBudgetStatus> {
  return useScreenQuery({
    queryKey: BUDGET_KEY,
    queryFn: () => api().call(B.readAiBudget, {}),
  });
}

export function useBudgetUpdate(): (change: AiBudgetChange) => Promise<AiBudgetStatus> {
  const client = useQueryClient();
  return async (change) => {
    const status = await api().call(B.updateAiBudget, { body: change });
    log.info('ai_budget.updated', { fields: Object.keys(change) });
    client.setQueryData(BUDGET_KEY, status);
    return status;
  };
}

export function pausedText(status: AiBudgetStatus): string | null {
  return status.stopped && status.reasons.length > 0
    ? `It stopped because ${status.reasons.join(' and ')}. Your own chats still work.`
    : null;
}
