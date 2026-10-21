import type { OpenRouterAccount } from '@smarteverything/domain';
import type { Money } from '../../region/model/money';

const LOW_CREDITS_USD = 1;

export interface Balance {
  readonly left: number;
  readonly total: number;
  readonly used: number;
}

export function balanceOf(account: OpenRouterAccount): Balance | null {
  if (account.credits.state !== 'known') {
    return null;
  }
  const { total, used } = account.credits;
  return { left: Math.max(0, total - used), total, used };
}

export function isLow(balance: Balance): boolean {
  return balance.left < LOW_CREDITS_USD;
}

export function usedLine(balance: Balance, money: Money): string {
  return `All keys, all time: ${money.dollars(balance.used)} used of ${money.dollars(balance.total)}`;
}
