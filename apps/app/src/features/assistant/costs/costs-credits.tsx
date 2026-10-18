import type { ReactNode } from 'react';
import { AppState, View } from 'react-native';
import * as Linking from 'expo-linking';
import { OPENROUTER_TOP_UP_URL, type OpenRouterAccount } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { ProgressBar } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { CardEmpty, CostCard } from './cost-card';
import { useMoney, type Money } from '../../region';
import {
  useOpenRouterAccount,
  useOpenRouterActions,
  useOpenRouterStatus,
} from '../data/openrouter';
import { background } from '@smarteverything/logging';

const LOW_CREDITS_USD = 1;

const SETTINGS_PAGE = 'assistant';

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
  return `Used ${money.dollars(balance.used)} of ${money.dollars(balance.total)}`;
}

export const MANAGEMENT_KEY_NOTE = 'OpenRouter shows the balance only to management keys.';

export function topUp(recheck: () => void): void {
  const listener = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      listener.remove();
      recheck();
    }
  });
  background(Linking.openURL(OPENROUTER_TOP_UP_URL), 'url.open_failed');
}

function BalanceView({ account }: { readonly account: OpenRouterAccount }): ReactNode {
  const money = useMoney();
  const balance = balanceOf(account);
  if (balance === null) {
    return (
      <Text variant="caption" tone="variant">
        {MANAGEMENT_KEY_NOTE}
      </Text>
    );
  }
  const low = isLow(balance);
  return (
    <View className="gap-2">
      <View className="gap-0.5">
        <Figure value={money.dollars(balance.left)} size="l" tone={low ? 'warning' : 'default'} />
        <Text variant="caption" tone={low ? 'warning' : 'variant'}>
          {low ? 'Running low' : 'Left to spend'}
        </Text>
      </View>
      <ProgressBar
        progress={balance.total > 0 ? balance.used / balance.total : 0}
        colour={low ? 'warning' : 'positive'}
        label={usedLine(balance, money)}
      />
      <Text variant="caption" tone="faint" numberOfLines={1}>
        {usedLine(balance, money)}
      </Text>
    </View>
  );
}

function WidgetBody({ link }: { readonly link: ReturnType<typeof href.settings.page> }): ReactNode {
  const status = useOpenRouterStatus();
  const keySet = status.data?.key === 'set';
  const account = useOpenRouterAccount(keySet);
  if (status.data !== undefined && !keySet) {
    return (
      <CardEmpty
        icon="key"
        colour="warning"
        title="No key yet"
        action={{ label: 'Add key', href: link }}
      />
    );
  }
  if (status.isError || account.isError) {
    return <CardEmpty icon="warning" colour="warning" title="Couldn’t check credits" />;
  }
  if (account.data === undefined) {
    return <Skeleton shape="block" className="h-16" />;
  }
  return <BalanceView account={account.data} />;
}

export function CreditsWidget(): ReactNode {
  const link = href.settings.page(SETTINGS_PAGE);
  const { recheckAccount } = useOpenRouterActions();
  const topUpButton = (
    <Button
      label="Top up"
      variant="text"
      onPress={() => {
        topUp(recheckAccount);
      }}
    />
  );
  return (
    <CostCard title="Credit left" icon="gauge" accent="positive" href={link} action={topUpButton}>
      <WidgetBody link={link} />
    </CostCard>
  );
}
