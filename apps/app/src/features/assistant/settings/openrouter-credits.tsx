import type { ReactNode } from 'react';
import type { OpenRouterAccount } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { ValueRow } from '../../../components/rows';
import { balanceOf, isLow, usedLine } from '../costs/credit-balance';
import { MANAGEMENT_KEY_NOTE, topUp } from '../costs/costs-credits';
import { useMoney, type Money } from '../../region';
import {
  useOpenRouterAccount,
  useOpenRouterActions,
  useOpenRouterStatus,
} from '../data/openrouter';

interface CreditLine {
  readonly value?: string;
  readonly subtitle: string;
  readonly warning: boolean;
}

function creditLine(
  keySet: boolean,
  account: OpenRouterAccount | undefined,
  failed: boolean,
  money: Money,
): CreditLine {
  if (!keySet) {
    return { subtitle: 'Add a key to see your credit', warning: false };
  }
  if (failed) {
    return { subtitle: 'Couldn’t check your credit', warning: true };
  }
  if (account === undefined) {
    return { value: '…', subtitle: 'Checking', warning: false };
  }
  const balance = balanceOf(account);
  if (balance === null) {
    return { subtitle: MANAGEMENT_KEY_NOTE, warning: false };
  }
  return {
    value: `${money.dollars(balance.left)} left`,
    subtitle: usedLine(balance, money),
    warning: isLow(balance),
  };
}

function useAccount(): ReturnType<typeof useOpenRouterAccount> & { readonly keySet: boolean } {
  const status = useOpenRouterStatus();
  const keySet = status.data?.key === 'set';
  return Object.assign(useOpenRouterAccount(keySet), { keySet });
}

export function CreditRow(): ReactNode {
  const account = useAccount();
  const { recheckAccount } = useOpenRouterActions();
  const money = useMoney();
  const line = creditLine(account.keySet, account.data, account.isError, money);
  return (
    <ListRow
      title="Account credit"
      icon="gauge"
      iconTone={line.warning ? 'warning' : 'positive'}
      subtitle={line.subtitle}
      subtitleTone={line.warning ? 'warning' : 'variant'}
      {...(line.value === undefined ? {} : { value: line.value })}
      trailing={
        <Button
          label="Top up"
          variant="tonal"
          onPress={() => {
            topUp(recheckAccount);
          }}
        />
      }
    />
  );
}

type SpendKey = 'usage_daily' | 'usage_weekly' | 'usage_monthly';

export function KeySpendRow({
  title,
  field,
  account,
}: {
  readonly title: string;
  readonly field: SpendKey;
  readonly account: OpenRouterAccount;
}): ReactNode {
  const money = useMoney();
  return <ValueRow title={title} value={money.dollars(account[field])} />;
}

function limitTitle(reset: string | null): string {
  return reset === null ? 'This key’s limit' : `This key’s ${reset} limit`;
}

export function KeyLimitRow({
  account,
  limit,
}: {
  readonly account: OpenRouterAccount;
  readonly limit: number;
}): ReactNode {
  const money = useMoney();
  return (
    <ValueRow
      title={limitTitle(account.limit_reset)}
      value={
        account.limit_remaining === null
          ? money.dollars(limit)
          : `${money.dollars(account.limit_remaining)} left of ${money.dollars(limit)}`
      }
    />
  );
}
