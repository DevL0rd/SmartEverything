import type { ReactNode } from 'react';
import type { OpenRouterAccount } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { ValueRow } from '../../../components/rows';
import {
  balanceOf,
  isLow,
  MANAGEMENT_KEY_NOTE,
  topUp,
  usd,
  usedLine,
} from '../costs/costs-credits';
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
    value: `${usd(balance.left)} left`,
    subtitle: usedLine(balance),
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
  const line = creditLine(account.keySet, account.data, account.isError);
  return (
    <ListRow
      title="Credit"
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
}: {
  readonly title: string;
  readonly field: SpendKey;
}): ReactNode {
  const account = useAccount();
  return account.data === undefined ? null : (
    <ValueRow title={title} value={usd(account.data[field])} />
  );
}

function limitTitle(reset: string | null): string {
  return reset === null ? 'This key’s limit' : `This key’s ${reset} limit`;
}

export function KeyLimitRow(): ReactNode {
  const account = useAccount();
  const data = account.data;
  if (data === undefined) {
    return null;
  }
  if (data.limit === null) {
    return null;
  }
  return (
    <ValueRow
      title={limitTitle(data.limit_reset)}
      value={
        data.limit_remaining === null
          ? usd(data.limit)
          : `${usd(data.limit_remaining)} left of ${usd(data.limit)}`
      }
    />
  );
}
