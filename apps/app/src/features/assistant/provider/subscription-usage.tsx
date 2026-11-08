import { useHarnessCatalogue } from '../data/harness';
import { harnessHostName } from '../model/harness-context';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  weeklySubscriptionWindow,
  type AiChatRow,
  type AiHarnessCatalogue,
  type ComputerAiRuntime,
} from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useIsOwner, useDevice } from '../../../store/selectors';
import { useMinuteOf } from '../../../store/clock';
import { useChatProvider } from './provider-data';
import { useCodexProvider } from './codex-provider-data';
import type { CodexChatProvider } from '../../../queries/codex-provider-events';
import { COMPUTER_ENGINE_LABELS, isComputerEngine } from './computer-engine';
import {
  codexSubscriptionWindows,
  projectedSubscriptionWindows,
  subscriptionResetText,
  weeklyAllowance,
  type WeeklyAllowance,
  type SubscriptionWindow,
} from './subscription-usage-values';
import { dateTimeText } from '../../../format/locale';
interface AccountUsage {
  readonly windows: readonly SubscriptionWindow[];
  readonly computer: string;
  readonly provider?: string;
  readonly reportedAt?: string;
}

export type ChatBilling =
  | { readonly kind: 'metered' }
  | { readonly kind: 'unknown'; readonly account: AccountUsage }
  | {
      readonly kind: 'subscription-only';
      readonly account: AccountUsage;
      readonly runtime: ComputerAiRuntime | undefined;
    };

export function SubscriptionUsageBars({
  windows,
  computer,
  provider,
  reportedAt,
}: AccountUsage): ReactNode {
  return (
    <View className="gap-2 px-4 py-3">
      <Text variant="label">Subscription usage</Text>
      <Text variant="caption" tone="variant">
        {provider === undefined ? 'Account' : `${provider} account`} on {computer} · shared across
        chats
      </Text>
      {reportedAt === undefined ? null : (
        <Text variant="caption" tone="variant">
          Reported {dateTimeText(new Date(reportedAt))}
        </Text>
      )}
      <UsageWindows windows={windows} />
    </View>
  );
}

function useNativeWindows(chat: AiChatRow): readonly SubscriptionWindow[] {
  const owner = useIsOwner();
  const { kind } = chat.engine;
  const claude = useChatProvider(chat.id, owner && kind === 'claude').data;
  const codex = useCodexProvider(chat.id, owner && kind === 'codex').data;
  if (!owner) return [];
  if (kind === 'claude') return projectedSubscriptionWindows(claude?.subscription_usage);
  return kind === 'codex' ? codexWindows(codex) : [];
}

function codexWindows(provider: CodexChatProvider | undefined): readonly SubscriptionWindow[] {
  if (provider?.subscription_usage !== undefined)
    return projectedSubscriptionWindows(provider.subscription_usage);
  const event = provider?.events.findLast((item) => item.kind === 'usage');
  return codexSubscriptionWindows(event?.usage.rate_limits);
}

function harnessBilling(catalogue: AiHarnessCatalogue | undefined, routeId: string): ChatBilling {
  const route = catalogue?.routes.find((row) => row.id === routeId);
  if (route === undefined) {
    return {
      kind: 'unknown',
      account: { computer: 'Supplier unavailable', provider: 'SmartEverything', windows: [] },
    };
  }
  if (route.billing === 'metered') return { kind: 'metered' };
  return {
    kind: route.billing,
    runtime: route.usage?.runtime,
    account: {
      computer: harnessHostName(route.supplier, catalogue),
      provider: route.auth.provider,
      windows: projectedSubscriptionWindows(route.usage),
      ...(route.usage === undefined ? {} : { reportedAt: route.usage.reported_at }),
    },
  };
}

export function useChatBilling(chat: AiChatRow): ChatBilling {
  const { engine } = chat;
  const catalogue = useHarnessCatalogue().data;
  const device = useDevice(isComputerEngine(engine) ? engine.device_id : '');
  const nativeWindows = useNativeWindows(chat);
  if (isComputerEngine(engine)) {
    return {
      kind: 'subscription-only',
      runtime: engine.kind,
      account: {
        computer: device?.label ?? 'Computer unavailable',
        provider: COMPUTER_ENGINE_LABELS[engine.kind].name,
        windows: nativeWindows,
      },
    };
  }
  return harnessBilling(catalogue, engine.model_route_id);
}

export function ChatSubscriptionUsage({ chat }: { readonly chat: AiChatRow }): ReactNode {
  const billing = useChatBilling(chat);
  return billing.kind === 'metered' ? null : <SubscriptionUsageBars {...billing.account} />;
}

function sameAllowance(left: WeeklyAllowance | null, right: WeeklyAllowance | null): boolean {
  return left === right || (left?.text === right?.text && left?.resetAt === right?.resetAt);
}

export function useWeeklyAllowance(billing: ChatBilling): WeeklyAllowance | null {
  const window =
    billing.kind === 'subscription-only' && billing.runtime !== undefined
      ? weeklySubscriptionWindow({ runtime: billing.runtime, windows: billing.account.windows })
      : undefined;
  return useMinuteOf((now) => weeklyAllowance(window, now), sameAllowance);
}

function UsageWindow({ window }: { readonly window: SubscriptionWindow }): ReactNode {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="variant" className="min-w-0 flex-1">
          {window.label}
        </Text>
        <Text variant="caption" tone="variant" className="tabular">
          {window.percent === null ? 'Unavailable' : `${String(window.percent)} %`}
        </Text>
      </View>
      {window.percent === null ? null : (
        <ProgressBar
          progress={Math.min(1, window.percent / 100)}
          colour={window.percent >= 80 ? 'warning' : 'primary'}
          label={`${window.label} used`}
        />
      )}
      {window.resetAt === null ? null : (
        <Text variant="caption" tone="variant">
          Resets {subscriptionResetText(window.resetAt)}
        </Text>
      )}
    </View>
  );
}

function UsageWindows({ windows }: { readonly windows: readonly SubscriptionWindow[] }): ReactNode {
  if (windows.length === 0)
    return (
      <Text variant="caption" tone="variant">
        Reported plan usage unavailable
      </Text>
    );
  return (
    <View className="gap-2">
      {windows.map((window) => (
        <UsageWindow key={window.id} window={window} />
      ))}
    </View>
  );
}
