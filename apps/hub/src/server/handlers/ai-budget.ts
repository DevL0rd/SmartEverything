import { API_ENDPOINTS as E } from '@smarteverything/domain';
import type { Budget } from '../../ledger/budget';
import { bound, type Bound } from '../router';

type BudgetRoutes = Record<'readAiBudget' | 'updateAiBudget', Bound>;

export function aiBudgetRoutes(budget: Budget): BudgetRoutes {
  return {
    readAiBudget: bound(E.readAiBudget, () => budget.status()),
    updateAiBudget: bound(E.updateAiBudget, ({ body }) => budget.update(body)),
  };
}
