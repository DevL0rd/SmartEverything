import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { Budget } from '../../ledger/budget';
import { bound } from '../router';

export const aiBudgetRoutes = (budget: Budget) =>
  ({
    readAiBudget: bound(E.readAiBudget, () => budget.status()),
    updateAiBudget: bound(E.updateAiBudget, ({ body }) => budget.update(body)),
  }) as const;
