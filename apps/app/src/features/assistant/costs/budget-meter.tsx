import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiBudgetPeriod, AiBudgetStatus } from '@smarteverything/domain';
import { href } from '../../../app-shell/hrefs';
import { ProgressBar } from '../../../components/charts';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { CardEmpty, CostCard } from './cost-card';
import type { ColourRole } from '../../../design/tokens';
import { useMoney } from '../../region';
import { useBudgetStatus } from '../data/budget';

export const BUDGET_PAGE = 'assistant/budget';

function colourOf(share: number, warnAt: number): ColourRole {
  if (share >= 1) {
    return 'critical';
  }
  return share * 100 >= warnAt ? 'warning' : 'positive';
}

function Meter({
  name,
  period,
  warnAt,
}: {
  readonly name: string;
  readonly period: AiBudgetPeriod;
  readonly warnAt: number;
}): ReactNode {
  const money = useMoney();
  if (period.limit_micros === null) {
    return null;
  }
  const share = period.spent_micros / Math.max(1, period.limit_micros);
  const caption = `${money.cost(period.spent_micros)} of ${money.cost(period.limit_micros)} ${name}${(period.unknown_count ?? 0) > 0 ? ' · Known costs only; supplier costs unavailable' : ''}`;
  return (
    <View className="gap-1">
      <ProgressBar progress={share} colour={colourOf(share, warnAt)} label={caption} />
      <Text variant="caption" tone={share >= 1 ? 'critical' : 'variant'} numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}

function MeterBody({ status }: { readonly status: AiBudgetStatus }): ReactNode {
  const { today, month, settings } = status;
  if (today.limit_micros === null && month.limit_micros === null) {
    return (
      <CardEmpty
        icon="gauge"
        colour="primary"
        title="No budget set"
        action={{ label: 'Set a budget', href: href.settings.page(BUDGET_PAGE) }}
      />
    );
  }
  return (
    <View className="gap-3">
      <Meter name="today" period={today} warnAt={settings.warn_at_percent} />
      <Meter name="this month" period={month} warnAt={settings.warn_at_percent} />
    </View>
  );
}

export function BudgetMeter(): ReactNode {
  const status = useBudgetStatus();
  const stopped = status.data?.stopped === true;
  return (
    <CostCard
      title="Budget"
      icon="gauge"
      accent={stopped ? 'critical' : 'primary'}
      href={href.settings.page(BUDGET_PAGE)}
    >
      {status.isError ? (
        <CardEmpty icon="warning" colour="warning" title="Couldn’t load the budget" />
      ) : status.data === undefined ? (
        <Skeleton shape="block" className="h-16" />
      ) : (
        <MeterBody status={status.data} />
      )}
    </CostCard>
  );
}
