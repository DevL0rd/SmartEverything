import {
  AI_BUDGET_KEY,
  AI_BUDGET_SETTINGS,
  ApiError,
  BACKGROUND_WORKS,
  type AiBudgetChange,
  type AiBudgetPeriod,
  type AiBudgetSettings,
  type AiBudgetStatus,
  type AiUsageRow,
  type UsageWork,
} from '@smarteverything/domain';
import { background, type Logger } from '@smarteverything/logging';
import type { OwnerAlerts } from '../extensions/owner-alerts';
import type { CreditsWatch } from './budget-credits';
import { PersonBudgets, type PersonAlert, type PersonBudgetSource } from './person-budget';
import {
  alertsOf,
  limitOf,
  lowCreditsAlert,
  periodStarts,
  stopReasons,
  type BudgetAlert,
  type Spend,
} from './budget-rules';
import type { Ledger, Unsubscribe } from './ledger';

interface BudgetSettingsStore {
  readonly read: (key: string) => Readonly<Record<string, unknown>> | null;
  readonly save: (key: string, settings: Readonly<Record<string, unknown>>) => void;
}

export interface BudgetOptions {
  readonly ledger: Ledger;
  readonly settings: BudgetSettingsStore;
  readonly credits: CreditsWatch;
  readonly people: PersonBudgetSource;
  readonly alerts: OwnerAlerts;
  readonly note: (chatId: string, text: string) => void;
  readonly now: () => Date;
  readonly log: Logger;
}

export type BudgetListener = (alert: BudgetAlert, row: AiUsageRow | null) => void;

export class BudgetStopError extends ApiError {
  constructor(reasons: readonly string[]) {
    super(
      'conflict',
      `Background AI is paused: ${reasons.join(' and ')}. Your own chats still work.`,
    );
  }
}

export class Budget {
  private readonly sent = new Set<string>();
  private readonly listeners = new Set<BudgetListener>();
  private stopWatching: Unsubscribe | null = null;
  private readonly people: PersonBudgets;
  readonly gate = {
    check: (
      work: UsageWork,
      mode?: { readonly background?: true; readonly profileId?: string },
    ): void => {
      const background = BACKGROUND_WORKS.has(work) || mode?.background === true;
      const reasons = background ? stopReasons(this.spend(), this.settings()) : [];
      if (reasons.length > 0) {
        throw new BudgetStopError(reasons);
      }
      if (mode?.profileId !== undefined) {
        this.people.check(mode.profileId);
      }
    },
  };

  constructor(private readonly options: BudgetOptions) {
    this.people = new PersonBudgets({
      ledger: options.ledger,
      people: options.people,
      now: options.now,
    });
  }

  start(): void {
    this.baseline();
    this.stopWatching = this.options.ledger.on((row) => {
      this.observe(row);
    });
  }

  stop(): void {
    this.stopWatching?.();
    this.stopWatching = null;
  }

  settings(): AiBudgetSettings {
    return AI_BUDGET_SETTINGS.parse(this.options.settings.read(AI_BUDGET_KEY) ?? {});
  }

  exhausted(): string | null {
    const reasons = stopReasons(this.spend(), this.settings());
    return reasons.length === 0 ? null : reasons.join(' and ');
  }

  async status(): Promise<AiBudgetStatus> {
    const reading = await this.options.credits.fresh();
    this.creditAlerts(null);
    const settings = this.settings();
    const spend = this.spend();
    const reasons = stopReasons(spend, settings);
    return {
      settings,
      ...spend,
      credits: reading.credits,
      credits_checked_at: reading.checkedAt,
      stopped: reasons.length > 0,
      reasons,
    };
  }

  update(change: AiBudgetChange): Promise<AiBudgetStatus> {
    const settings = AI_BUDGET_SETTINGS.parse({ ...this.settings(), ...change });
    this.options.settings.save(AI_BUDGET_KEY, settings);
    this.baseline();
    this.options.log.info('budget.updated', { fields: Object.keys(change) });
    return this.status();
  }

  on(listener: BudgetListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private spend(): Spend {
    const { ledger, now } = this.options;
    const settings = this.settings();
    const at = now();
    const starts = periodStarts(at, ledger.zone());
    return {
      today: this.period(starts.today, settings.daily_usd),
      month: this.period(starts.month, settings.monthly_usd),
      burn:
        settings.burn === null
          ? null
          : {
              ...this.period(
                new Date(at.getTime() - settings.burn.minutes * 60_000).toISOString(),
                settings.burn.usd,
              ),
              minutes: settings.burn.minutes,
            },
    };
  }

  private period(from: string, limitUsd: number | null): AiBudgetPeriod {
    return {
      from,
      spent_micros: this.options.ledger.spentSince(from),
      unknown_count: this.options.ledger.unknownSince(from),
      limit_micros: limitOf(limitUsd),
    };
  }

  private baseline(): void {
    this.sent.clear();
    for (const alert of alertsOf(this.spend(), this.settings())) {
      this.sent.add(alert.key);
    }
    for (const { alert } of this.people.allAlerts()) {
      this.sent.add(alert.key);
    }
  }

  private observe(row: AiUsageRow): void {
    try {
      this.raise(alertsOf(this.spend(), this.settings()), row);
      this.raisePerson(this.people.alerts(row.profile_id), row);
    } catch (cause) {
      this.options.log.error('budget.check_failed', cause, { usageId: row.id });
    }
    if (row.source === 'openrouter' && row.cost_state === 'reconciled') {
      background(
        this.options.credits.fresh().then(() => {
          this.creditAlerts(row);
        }),
        'credits.refresh_failed',
      );
    }
  }

  private creditAlerts(row: AiUsageRow | null): void {
    const { credits } = this.options.credits.current();
    if (credits.state === 'known') {
      this.raise(lowCreditsAlert(credits.total - credits.used, this.settings()), row);
    }
  }

  private raise(alerts: readonly BudgetAlert[], row: AiUsageRow | null): void {
    for (const alert of alerts.filter((candidate) => !this.sent.has(candidate.key))) {
      this.sent.add(alert.key);
      this.deliver(alert, row);
    }
  }

  private raisePerson(alerts: readonly PersonAlert[], row: AiUsageRow): void {
    for (const { profileId, alert } of alerts.filter(({ alert: one }) => !this.sent.has(one.key))) {
      this.sent.add(alert.key);
      this.deliver(alert, row, profileId);
    }
  }

  private deliver(alert: BudgetAlert, row: AiUsageRow | null, person?: string): void {
    const { alerts, note, log } = this.options;
    const chatId = row === null ? null : row.chat_id;
    log.info('budget.alert', { key: alert.key, chatId });
    alerts.raise({
      title: alert.title,
      body: alert.body,
      data: { kind: 'ai_budget', reason: alert.key, path: '/assistant/costs' },
      ...(person === undefined ? {} : { person }),
    });
    if (chatId !== null) {
      try {
        note(chatId, `${alert.title}. ${alert.body}`);
      } catch (cause) {
        log.error('budget.note_failed', cause, { key: alert.key, chatId });
      }
    }
    for (const listener of this.listeners) {
      listener(alert, row);
    }
  }
}
