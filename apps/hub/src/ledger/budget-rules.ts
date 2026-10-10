import {
  localClock,
  microsOfUsd,
  usdOfMicros,
  zonedInstant,
  type AiBudgetPeriod,
  type AiBudgetSettings,
} from '@smarteverything/domain';

export interface Spend {
  readonly today: AiBudgetPeriod;
  readonly month: AiBudgetPeriod;
  readonly burn: (AiBudgetPeriod & { readonly minutes: number }) | null;
}

export interface BudgetAlert {
  readonly key: string;
  readonly title: string;
  readonly body: string;
}

export function periodStarts(now: Date, timeZone: string): { today: string; month: string } {
  const clock = localClock(now, timeZone);
  const date = { year: clock.year, month: clock.month, day: clock.day };
  return {
    today: zonedInstant(date, 0, timeZone).toISOString(),
    month: zonedInstant({ ...date, day: 1 }, 0, timeZone).toISOString(),
  };
}

export function limitOf(usd: number | null): number | null {
  return usd === null ? null : microsOfUsd(usd);
}

function money(micros: number): string {
  return `$${usdOfMicros(micros).toFixed(2)}`;
}

function periodAlerts(
  name: 'Today' | 'This month',
  key: string,
  period: AiBudgetPeriod,
  warnPercent: number,
): BudgetAlert[] {
  const limit = period.limit_micros;
  if (limit === null) {
    return [];
  }
  const spent = money(period.spent_micros);
  if (period.spent_micros >= limit) {
    return [
      {
        key: `${key}:full`,
        title: `${name}'s AI budget is used up`,
        body: `${spent} of ${money(limit)} spent.`,
      },
    ];
  }
  if (period.spent_micros * 100 >= limit * warnPercent) {
    return [
      {
        key: `${key}:warn`,
        title: `${name}'s AI spend is at ${String(warnPercent)}%`,
        body: `${spent} of ${money(limit)} spent.`,
      },
    ];
  }
  return [];
}

function burnAlerts(burn: Spend['burn']): BudgetAlert[] {
  if (burn === null) {
    return [];
  }
  const limit = burn.limit_micros;
  if (limit === null || burn.spent_micros < limit) {
    return [];
  }
  return [
    {
      key: `burn:${String(Math.floor(Date.parse(burn.from) / (burn.minutes * 60_000)))}`,
      title: 'AI is spending fast',
      body: `${money(burn.spent_micros)} in the last ${String(burn.minutes)} minutes.`,
    },
  ];
}

export function alertsOf(spend: Spend, settings: AiBudgetSettings): BudgetAlert[] {
  return [
    ...periodAlerts('Today', `daily:${spend.today.from}`, spend.today, settings.warn_at_percent),
    ...periodAlerts(
      'This month',
      `monthly:${spend.month.from}`,
      spend.month,
      settings.warn_at_percent,
    ),
    ...burnAlerts(spend.burn),
  ];
}

export function lowCreditsAlert(remainingUsd: number, settings: AiBudgetSettings): BudgetAlert[] {
  const threshold = settings.low_credits_usd;
  if (threshold === null || remainingUsd >= threshold) {
    return [];
  }
  return [
    {
      key: `credits:${String(threshold)}`,
      title: 'OpenRouter credits are low',
      body: `$${remainingUsd.toFixed(2)} left. Top up to keep AI chats running.`,
    },
  ];
}

function usedUp(name: string, period: AiBudgetPeriod): string[] {
  const limit = period.limit_micros;
  return limit !== null && period.spent_micros >= limit
    ? [`${name} ${money(limit)} budget is used up`]
    : [];
}

export function stopReasons(spend: Spend, settings: AiBudgetSettings): string[] {
  return settings.hard_stop
    ? [...usedUp("today's", spend.today), ...usedUp("this month's", spend.month)]
    : [];
}
