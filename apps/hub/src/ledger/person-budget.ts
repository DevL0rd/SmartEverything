import {
  ApiError,
  type AiBudgetPeriod,
  type AiBudgetSettings,
  type PersonBudget,
} from '@smarteverything/domain';
import {
  alertsOf,
  limitOf,
  periodStarts,
  stopReasons,
  type BudgetAlert,
  type Spend,
} from './budget-rules';
import type { Ledger } from './ledger';

export interface PersonBudgetSource {
  readonly budget: (profileId: string) => PersonBudget | null | undefined;
  readonly budgeted: () => readonly string[];
  readonly name: (profileId: string) => string;
}

export interface PersonBudgetOptions {
  readonly ledger: Ledger;
  readonly people: PersonBudgetSource;
  readonly now: () => Date;
}

export interface PersonAlert {
  readonly profileId: string;
  readonly alert: BudgetAlert;
}

export class PersonBudgetStopError extends ApiError {
  constructor(reasons: readonly string[]) {
    super(
      'conflict',
      `Your AI budget is used up: ${reasons.join(' and ')}. Ask the owner for more.`,
    );
  }
}

export class PersonBudgetUnreadableError extends ApiError {
  constructor(profileId: string) {
    super(
      'conflict',
      `The AI budget of person ${profileId} cannot be read; the owner has to check it.`,
    );
  }
}

function settingsOf(budget: PersonBudget): AiBudgetSettings {
  return { ...budget, burn: null, low_credits_usd: null };
}

export class PersonBudgets {
  constructor(private readonly options: PersonBudgetOptions) {}

  check(profileId: string): void {
    const budget = this.options.people.budget(profileId);
    if (budget === undefined) throw new PersonBudgetUnreadableError(profileId);
    if (budget === null) return;
    const reasons = stopReasons(this.spend(profileId, budget), settingsOf(budget));
    if (reasons.length > 0) throw new PersonBudgetStopError(reasons);
  }

  alerts(profileId: string): PersonAlert[] {
    const budget = this.options.people.budget(profileId);
    if (budget === null || budget === undefined) return [];
    const name = this.options.people.name(profileId);
    return alertsOf(this.spend(profileId, budget), settingsOf(budget)).map((alert) => ({
      profileId,
      alert: {
        ...alert,
        key: `person:${profileId}:${alert.key}`,
        title: `${name}: ${alert.title}`,
      },
    }));
  }

  allAlerts(): PersonAlert[] {
    return this.options.people.budgeted().flatMap((profileId) => this.alerts(profileId));
  }

  private spend(profileId: string, budget: PersonBudget): Spend {
    const { ledger, now } = this.options;
    const starts = periodStarts(now(), ledger.zone());
    return {
      today: this.period(profileId, starts.today, budget.daily_usd),
      month: this.period(profileId, starts.month, budget.monthly_usd),
      burn: null,
    };
  }

  private period(profileId: string, from: string, limitUsd: number | null): AiBudgetPeriod {
    return {
      from,
      spent_micros: this.options.ledger.spentByProfile(from, profileId),
      limit_micros: limitOf(limitUsd),
    };
  }
}
