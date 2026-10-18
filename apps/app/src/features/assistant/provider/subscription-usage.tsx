import { useHarnessCatalogue } from '../data/harness';
import { harnessHostName } from '../model/harness-context';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AiChatRow, DshEngine } from '@smarteverything/domain';
import { ProgressBar } from '../../../components/charts';
import { Text } from '../../../components/text';
import { useIsOwner, useDevice } from '../../../store/selectors';
import { useChatProvider } from './provider-data';
import { useCodexProvider } from './codex-provider-data';
import { isComputerEngine } from './computer-engine';
import {
  codexSubscriptionWindows,
  projectedSubscriptionWindows,
  type SubscriptionWindow,
} from './subscription-usage-values';
import { dateTimeText } from '../../../format/locale';
export function SubscriptionUsageBars({
  windows,
  computer,
  provider,
  compact = false,
  reportedAt,
}: {
  readonly compact?: boolean;
  readonly reportedAt?: string;
  readonly windows: readonly SubscriptionWindow[];
  readonly computer: string;
  readonly provider?: string;
}): ReactNode {
  if (compact) return <CompactSubscriptionWindows windows={windows} />;
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
      {windows.length === 0 ? (
        <Text variant="caption" tone="variant">
          Reported plan usage unavailable
        </Text>
      ) : (
        <View className="gap-2">
          {windows.map((window) => (
            <UsageWindow key={window.key} window={window} compact={compact} />
          ))}
        </View>
      )}
    </View>
  );
}
function CodexUsage({
  chat,
  computer,
  compact,
}: {
  readonly chat: AiChatRow;
  readonly computer: string;
  readonly compact: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const provider = useCodexProvider(chat.id, owner);
  const reported = provider.data?.events.filter((event) => event.kind === 'usage').at(-1);
  const windows =
    provider.data?.subscription_usage === undefined
      ? codexSubscriptionWindows(reported?.kind === 'usage' ? reported.usage.rate_limits : null)
      : projectedSubscriptionWindows(provider.data.subscription_usage);
  return (
    <SubscriptionUsageBars
      provider="Codex"
      compact={compact}
      computer={computer}
      windows={windows}
    />
  );
}

function ClaudeUsage({
  chatId,
  computer,
  compact,
}: {
  readonly chatId: string;
  readonly computer: string;
  readonly compact: boolean;
}): ReactNode {
  const owner = useIsOwner();
  const provider = useChatProvider(chatId, owner);
  return (
    <SubscriptionUsageBars
      computer={computer}
      provider="Claude"
      compact={compact}
      windows={projectedSubscriptionWindows(provider.data?.subscription_usage)}
    />
  );
}
export function ChatSubscriptionUsage({
  chat,
  compact = false,
}: {
  readonly chat: AiChatRow;
  readonly compact?: boolean;
}): ReactNode {
  const deviceId = isComputerEngine(chat.engine) ? chat.engine.device_id : '';
  const device = useDevice(deviceId);
  if (chat.engine.kind === 'dsh')
    return <HarnessSubscriptionUsage engine={chat.engine} compact={compact} />;
  if (!isComputerEngine(chat.engine)) return null;
  const computer = device?.label ?? 'Computer unavailable';
  return chat.engine.kind === 'codex' ? (
    <CodexUsage compact={compact} chat={chat} computer={computer} />
  ) : (
    <ClaudeUsage compact={compact} chatId={chat.id} computer={computer} />
  );
}

function UsageWindow({
  window,
  compact,
}: {
  readonly window: SubscriptionWindow;
  readonly compact: boolean;
}): ReactNode {
  return (
    <View className={compact ? 'min-w-40 flex-1 gap-1' : 'gap-1'}>
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="variant" className="flex-1">
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
          label={`${window.label}: ${String(window.percent)} percent used`}
        />
      )}
      {window.reset === null ? null : (
        <Text variant="caption" tone="variant">
          Resets {window.reset}
        </Text>
      )}
    </View>
  );
}

function HarnessSubscriptionUsage({
  engine,
  compact,
}: {
  readonly engine: DshEngine;
  readonly compact: boolean;
}): ReactNode {
  const catalogue = useHarnessCatalogue();
  const route = catalogue.data?.routes.find((row) => row.id === engine.model_route_id);
  if (route?.billing === 'metered') return null;
  return (
    <SubscriptionUsageBars
      compact={compact}
      computer={
        route === undefined
          ? 'Supplier unavailable'
          : harnessHostName(route.supplier, catalogue.data)
      }
      provider={route?.auth.provider ?? 'SmartEverything'}
      windows={projectedSubscriptionWindows(route?.usage)}
      {...(route?.usage === undefined ? {} : { reportedAt: route.usage.reported_at })}
    />
  );
}

function CompactSubscriptionWindows({
  windows,
}: {
  readonly windows: readonly SubscriptionWindow[];
}): ReactNode {
  const known = windows.filter((window) => window.percent !== null).slice(0, 2);
  if (known.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-3 px-2">
      {known.map((window) => (
        <UsageWindow key={window.key} window={window} compact />
      ))}
    </View>
  );
}
