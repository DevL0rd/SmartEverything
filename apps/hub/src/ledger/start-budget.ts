import type { PersonBudget } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import type { OpenRouterPlatform } from '../openrouter/platform';
import type { Store } from '../store/store';
import { Budget } from './budget';
import { CreditsWatch } from './budget-credits';

export interface BudgetParts {
  readonly store: Store;
  readonly openRouter: OpenRouterPlatform;
  readonly alerts: OwnerAlerts;
  readonly note: (chatId: string, text: string) => void;
  readonly clock: Clock;
  readonly log: Logger;
}

export function startBudget(parts: BudgetParts): Budget {
  const { store, openRouter, clock, log } = parts;
  const credits = new CreditsWatch(
    {
      hasKey: (): boolean => openRouter.keys.current() !== null,
      credits: (): Promise<{ total: number; used: number }> => openRouter.client.credits(),
    },
    clock.now,
    log,
  );
  const budget = new Budget({
    ledger: store.ledger,
    settings: store.settingsKv,
    credits,
    people: {
      budget: (profileId): PersonBudget | null | undefined => store.personAccess.budget(profileId),
      budgeted: (): readonly string[] => store.personAccess.budgetedIds(),
      name: (profileId): string => store.profiles.byId(profileId).name,
    },
    alerts: parts.alerts,
    note: parts.note,
    now: clock.now,
    log,
  });
  budget.start();
  return budget;
}
