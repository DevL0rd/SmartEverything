import type { PersonBudget } from '@smarteverything/domain';
import {
  PersonBudgetStopError,
  PersonBudgetUnreadableError,
  PersonBudgets,
} from '../ledger/person-budget';
import { storeUnit } from '../store/host/unit';

export const PERSON_BUDGET_REFUSAL_UNIT = storeUnit(
  (store, { profileId }: { readonly profileId: string }): string | null => {
    const budgets = new PersonBudgets({
      ledger: store.ledger,
      people: {
        budget: (id): PersonBudget | null | undefined => store.personAccess.budget(id),
        budgeted: (): readonly string[] => store.personAccess.budgetedIds(),
        name: (id): string => store.profiles.byId(id).name,
      },
      now: (): Date => store.now(),
    });
    try {
      budgets.check(profileId);
      return null;
    } catch (cause) {
      if (cause instanceof PersonBudgetStopError || cause instanceof PersonBudgetUnreadableError)
        return cause.message;
      throw cause;
    }
  },
);
