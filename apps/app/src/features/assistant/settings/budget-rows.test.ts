import { describe, expect, it, vi } from 'vitest';
import type { AiBudgetSettings } from '@smarteverything/domain';

vi.mock('../../region', () => ({ useMoney: (): null => null }));
vi.mock('../data/budget', () => ({
  useBudgetStatus: (): null => null,
  useBudgetUpdate: (): null => null,
}));
vi.mock('../../../store/selectors', () => ({ useIsOwner: (): boolean => true }));

const { LIMITS } = await import('./budget-rows');
const { moneyOf } = await import('../../region/model/money');

const yen = moneyOf({
  currency: 'JPY',
  locale: 'ja-JP',
  rate: 150,
  rateDate: '2026-10-09',
  notice: null,
});
const settings: AiBudgetSettings = {
  daily_usd: 2,
  monthly_usd: null,
  warn_at_percent: 80,
  burn: { usd: 1.5, minutes: 30 },
  low_credits_usd: null,
  hard_stop: false,
};

describe('budget limits in local currency', () => {
  it('shows the stored USD amount in local currency with the currency named', () => {
    const [field] = LIMITS.daily.fields(settings, yen);
    expect(field?.initial).toBe(300);
    expect(field?.label).toContain('JPY');
    expect(field?.min).toBe(2);
  });

  it('converts the entered local amount to USD on save', () => {
    expect(LIMITS.daily.change({ usd: 450 }, yen)).toStrictEqual({ daily_usd: 3 });
    expect(LIMITS.monthly.change({ usd: 1_500 }, yen)).toStrictEqual({ monthly_usd: 10 });
    expect(LIMITS.credits.change({ usd: 75 }, yen)).toStrictEqual({ low_credits_usd: 0.5 });
  });

  it('converts only the amount of the spike alert, not its minutes', () => {
    expect(LIMITS.burn.change({ usd: 300, minutes: 45 }, yen)).toStrictEqual({
      burn: { usd: 2, minutes: 45 },
    });
    const fields = LIMITS.burn.fields(settings, yen);
    expect(fields[0]?.initial).toBe(225);
    expect(fields[1]?.initial).toBe(30);
  });
});
