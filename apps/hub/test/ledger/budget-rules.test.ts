import { AI_BUDGET_SETTINGS, type AiBudgetPeriod } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { stopReasons } from '../../src/ledger/budget-rules';

const SETTINGS = AI_BUDGET_SETTINGS.parse({ daily_usd: 1, monthly_usd: 10, hard_stop: true });
const MICROS_PER_USD = 1_000_000;

function period(spentUsd: number, limitUsd: number, unknown: number): AiBudgetPeriod {
  return {
    from: '2026-10-08T00:00:00.000Z',
    spent_micros: spentUsd * MICROS_PER_USD,
    unknown_count: unknown,
    limit_micros: limitUsd * MICROS_PER_USD,
  };
}

describe('hard stop', () => {
  it('does not stop background work because some costs are still unknown', () => {
    const spend = { today: period(0.2, 1, 3), month: period(2, 10, 3), burn: null };

    expect(stopReasons(spend, SETTINGS)).toStrictEqual([]);
  });

  it('stops once the known spend reaches the limit', () => {
    const spend = { today: period(1, 1, 2), month: period(2, 10, 2), burn: null };

    expect(stopReasons(spend, SETTINGS)).toStrictEqual(["today's $1.00 budget is used up"]);
  });
});
